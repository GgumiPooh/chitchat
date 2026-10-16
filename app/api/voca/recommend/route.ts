import "server-only";

import { pushToUser } from "@/entities/push-subscription";
import {
  getVocaRecommendationState,
  recommendVocaWords,
  saveVocaRecommendationState,
} from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { VOCA_ACTION_PARAM, VOCA_ACTION_RECOMMEND, VOCA_ROUTE } from "@/shared/config";
import type { VocaRecommendationSession } from "@/shared/db";
import { safelyRunAsync } from "@/shared/lib";
import { NextResponse, after } from "next/server";
import { z } from "zod";

const GRADE_LABELS: Record<"essential" | "core" | "killer", string> = {
  essential: "필수 기초",
  core: "핵심 빈출",
  killer: "최고난도 킬러",
};

const recommendSchema = z.object({
  tag: z.string().optional(),
  grade: z.enum(["essential", "core", "killer"]).optional(),
  customTopic: z.string().optional(),
  count: z.number().int().min(1).max(20).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const { state, addedWords } = await getVocaRecommendationState(user.id);
  return NextResponse.json({ state, addedWords });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => ({}));
  const parsed = recommendSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { tag, grade, customTopic, count } = parsed.data;

  const effectiveTag = tag || "전체";
  const effectiveGrade = grade || "core";
  const effectiveTopic = customTopic?.trim() || undefined;
  const effectiveCount = count || 8;

  const pendingState: VocaRecommendationSession = {
    status: "pending",
    tag: effectiveTag,
    grade: effectiveGrade,
    customTopic: effectiveTopic,
    items: [],
    updatedAt: new Date().toISOString(),
  };

  await saveVocaRecommendationState(user.id, pendingState);

  after(() =>
    safelyRunAsync(async () => {
      try {
        const items = await recommendVocaWords({
          userId: user.id,
          tag: effectiveTag,
          grade: effectiveGrade,
          customTopic: effectiveTopic,
          count: effectiveCount,
        });

        const completedState: VocaRecommendationSession = {
          status: "completed",
          tag: effectiveTag,
          grade: effectiveGrade,
          customTopic: effectiveTopic,
          items,
          updatedAt: new Date().toISOString(),
        };
        await saveVocaRecommendationState(user.id, completedState);

        const topicLabel = effectiveTopic ?? (effectiveTag === "전체" ? "맞춤" : effectiveTag);
        const gradeLabel = GRADE_LABELS[effectiveGrade];

        await pushToUser(user.id, {
          title: "AI 맞춤 단어 추천 완료",
          body: `${topicLabel} (${gradeLabel}) 추천 단어 ${items.length}개가 도착했어요.`,
          url: `${VOCA_ROUTE}?${VOCA_ACTION_PARAM}=${VOCA_ACTION_RECOMMEND}`,
          tag: "voca-recommend",
        });
      } catch (error) {
        console.error("[api/voca/recommend] Background recommendation failed:", error);
        const failedState: VocaRecommendationSession = {
          status: "failed",
          tag: effectiveTag,
          grade: effectiveGrade,
          customTopic: effectiveTopic,
          items: [],
          updatedAt: new Date().toISOString(),
        };
        await saveVocaRecommendationState(user.id, failedState);

        await pushToUser(user.id, {
          title: "AI 맞춤 단어 추천 실패",
          body: "추천 단어를 불러오지 못했어요. 다시 시도해주세요.",
          url: `${VOCA_ROUTE}?${VOCA_ACTION_PARAM}=${VOCA_ACTION_RECOMMEND}`,
          tag: "voca-recommend-failed",
        });
      }
    }),
  );

  return NextResponse.json({ accepted: true, state: pendingState }, { status: 202 });
}
