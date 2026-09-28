import "server-only";

import { mediaUploadSchema, validateMediaUpload, type ValidatedMedia } from "@/entities/media";
import { cancelTimeLetter, getTimeLetter, updateTimeLetter } from "@/entities/time-letter";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MediaId, TimeLetterId, UserId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const paramsSchema = snowflakeSchema<TimeLetterId>();

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const idParsed = paramsSchema.safeParse((await params).id);
  if (!idParsed.success) {
    return apiError("invalid_request");
  }

  const letter = await getTimeLetter({
    letterId: idParsed.data,
    currentUserId: user.id,
  });

  if (!letter) {
    return apiError("not_found");
  }

  return NextResponse.json({ letter });
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

  try {
    const success = await cancelTimeLetter({
      letterId: idParsed.data,
      userId: user.id,
    });

    if (!success) {
      return apiError("not_found");
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return apiError("invalid_request");
  }
}

const updateSchema = z.object({
  recipientId: snowflakeSchema<UserId>().nullable().optional(),
  title: z.string().max(200).nullable().optional(),
  content: z.string().min(1).optional(),
  theme: z.enum(["classic", "romantic", "midnight", "kraft"]).optional(),
  scheduledAt: z.string().or(z.date()).optional(),
  showTeaser: z.boolean().optional(),
  onlyMe: z.boolean().optional(),
  mediaIds: z.array(snowflakeSchema<MediaId>()).optional(),
  media: z.array(mediaUploadSchema).optional(),
});

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
  const parsed = updateSchema.safeParse(json);
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

    const letter = await updateTimeLetter({
      letterId: idParsed.data,
      userId: user.id,
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

    return NextResponse.json({ letter });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("not found")) {
      return apiError("not_found");
    }
    if (message.includes("Unauthorized")) {
      return apiError("unauthorized");
    }
    return apiError("invalid_request");
  }
}
