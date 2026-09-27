import "server-only";

import { mediaUploadSchema, validateMediaUpload, type ValidatedMedia } from "@/entities/media";
import { createTimeLetter, listTimeLetters, type TimeLetterStatus } from "@/entities/time-letter";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MediaId, UserId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["scheduled", "delivering", "sent", "canceled"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().positive().optional(),
});

const createSchema = z.object({
  recipientId: snowflakeSchema<UserId>().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  content: z.string().min(1),
  theme: z.enum(["classic", "romantic", "midnight", "kraft"]).default("classic"),
  scheduledAt: z.string().or(z.date()),
  showTeaser: z.boolean().default(false),
  onlyMe: z.boolean().default(false),
  mediaIds: z.array(snowflakeSchema<MediaId>()).optional(),
  media: z.array(mediaUploadSchema).optional(),
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

  const { status, cursor, limit } = parsed.data;

  const result = await listTimeLetters({
    currentUserId: user.id,
    status: status as TimeLetterStatus | undefined,
    cursor,
    limit,
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
  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  try {
    let validatedMedia: ValidatedMedia[] | undefined;
    if (parsed.data.media && parsed.data.media.length > 0) {
      const validated = await Promise.all(
        parsed.data.media.map((item) =>
          validateMediaUpload({ ownerId: user.id, upload: item, scope: "chat" }),
        ),
      );

      if (validated.some((item) => item === null)) {
        return apiError("unprocessable");
      }

      validatedMedia = validated as ValidatedMedia[];
    }

    const letter = await createTimeLetter({
      senderId: user.id,
      recipientId: parsed.data.recipientId,
      title: parsed.data.title,
      content: parsed.data.content,
      theme: parsed.data.theme,
      scheduledAt: parsed.data.scheduledAt,
      showTeaser: parsed.data.showTeaser,
      onlyMe: parsed.data.onlyMe,
      mediaIds: parsed.data.mediaIds,
      validatedMedia,
    });

    return NextResponse.json({ letter }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("limit reached")) {
      return apiError("conflict");
    }
    return apiError("invalid_request");
  }
}
