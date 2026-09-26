import "server-only";

import { deleteVocaCard, getVocaCard, updateVocaCard } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MediaId, VocaCardId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

type RouteParams = { params: Promise<{ id: string }> };

const paramsSchema = snowflakeSchema<VocaCardId>();

const patchCardSchema = z.object({
  targetWord: z.string().optional(),
  sentence: z.string().optional(),
  pos: z.string().optional(),
  pronunciation: z.string().optional(),
  koreanMeaning: z.string().optional(),
  englishDefinition: z.string().optional(),
  confusable: z.string().nullable().optional(),
  collocations: z.string().optional(),
  wordFamily: z.string().nullable().optional(),
  examples: z.union([z.array(z.string()), z.string()]).optional(),
  audioUrl: z.string().nullable().optional(),
  sentenceAudioUrl: z.string().nullable().optional(),
  audioMediaId: snowflakeSchema<MediaId>().nullable().optional(),
  sentenceAudioMediaId: snowflakeSchema<MediaId>().nullable().optional(),
  tags: z.string().nullable().optional(),
  suspended: z.boolean().optional(),
  state: z.enum(["new", "learning", "review", "relearning"]).optional(),
});

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const idParsed = paramsSchema.safeParse((await params).id);
  if (!idParsed.success) {
    return apiError("invalid_request");
  }

  const card = await getVocaCard(user.id, idParsed.data);
  if (!card) {
    return apiError("not_found");
  }

  return NextResponse.json({ card });
}

export async function PATCH(request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const idParsed = paramsSchema.safeParse((await params).id);
  if (!idParsed.success) {
    return apiError("invalid_request");
  }

  const json = await request.json().catch(() => null);
  const parsed = patchCardSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const card = await updateVocaCard(user.id, idParsed.data, parsed.data);
  if (!card) {
    return apiError("not_found");
  }

  return NextResponse.json({ card });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const idParsed = paramsSchema.safeParse((await params).id);
  if (!idParsed.success) {
    return apiError("invalid_request");
  }

  const deleted = await deleteVocaCard(user.id, idParsed.data);
  if (!deleted) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}
