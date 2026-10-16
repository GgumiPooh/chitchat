import type { Nullable, Optional } from "@/shared/lib";

export const VOCA_RECOMMEND_TAGS = [
  "전체",
  "토익",
  "수능",
  "공무원",
  "비즈니스",
  "일상 회화",
  "IT/개발",
] as const;

export type VocaRecommendTag = (typeof VOCA_RECOMMEND_TAGS)[number];

export function isVocaRecommendTag(tag: string): tag is VocaRecommendTag {
  return (VOCA_RECOMMEND_TAGS as readonly string[]).includes(tag);
}

export type VocaRecommendGrade = "essential" | "core" | "killer";

export type VocaRecommendItem = {
  targetWord: string;
  pos: string;
  koreanMeaning: string;
};

export type VocaWordGenerationStatus = "idle" | "loading" | "added" | "failed";

export type VocaRecommendStatus = "idle" | "pending" | "completed" | "failed";

export type VocaRecommendationState = {
  status: VocaRecommendStatus;
  tag: string;
  grade: VocaRecommendGrade;
  customTopic?: Optional<string>;
  items: VocaRecommendItem[];
  updatedAt: string;
};

export type VocaRecommendResponse = {
  state: Nullable<VocaRecommendationState>;
  addedWords: string[];
};

export type VocaRecommendParams = {
  customTopic: string;
  grade: VocaRecommendGrade;
  tag: VocaRecommendTag;
};
