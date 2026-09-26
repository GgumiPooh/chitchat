import "server-only";

import { createVocaCard, listVocaCards } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MediaId, VocaCardId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  before: snowflakeSchema<VocaCardId>().optional(),
  limit: z.coerce.number().int().positive().optional(),
  query: z.string().optional(),
  state: z.enum(["new", "learning", "review", "relearning"]).optional(),
  tag: z.string().optional(),
  suspended: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
});

const createCardSchema = z.object({
  targetWord: z.string().min(1),
  sentence: z.string().min(1),
  pos: z.string().min(1),
  pronunciation: z.string().default(""),
  koreanMeaning: z.string().min(1),
  englishDefinition: z.string().default(""),
  confusable: z.string().nullable().optional(),
  collocations: z.string().default(""),
  wordFamily: z.string().nullable().optional(),
  examples: z.union([z.array(z.string()), z.string()]).default([]),
  audioUrl: z.string().nullable().optional(),
  sentenceAudioUrl: z.string().nullable().optional(),
  audioMediaId: snowflakeSchema<MediaId>().nullable().optional(),
  sentenceAudioMediaId: snowflakeSchema<MediaId>().nullable().optional(),
  tags: z.string().nullable().optional(),
});

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const searchParams = Object.fromEntries(new URL(request.url).searchParams.entries());
  const parsed = querySchema.safeParse(searchParams);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const { before, limit, query, state, tag, suspended } = parsed.data;

  const result = await listVocaCards({
    userId: user.id,
    before,
    limit,
    query,
    state,
    tag,
    suspended,
  });

  return NextResponse.json({
    items: result.items,
    nextCursor: result.nextCursor,
    hasMore: result.hasMore,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = createCardSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const card = await createVocaCard({
    userId: user.id,
    ...parsed.data,
  });

  return NextResponse.json({ card }, { status: 201 });
}
