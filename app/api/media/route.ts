import { registerMedia } from "@/entities/media";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  r2Key: z.string().min(1),
  // INFO: REQUIREMENTS.md § 8.3. Read off the decoded `<img>` / `<video>` in the browser, because the server never receives the bytes to measure.
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().nonnegative().nullish(),
  // INFO: REQUIREMENTS.md § 10. An upload started in the Gallery tab that is not being posted to the conversation. It needs a marker of its own, because the grid's other source is the `message_media` join.
  addToGallery: z.boolean().optional(),
});

/**
 * Registers an object the browser has already uploaded (REQUIREMENTS.md § 9.).
 * Until this succeeds the object is unreachable — nothing in the app addresses
 * R2 by key, only by `media.id`.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // WARN: The prefix is the ownership check. `buildStorageKey` puts the uploader's id in the key, so a caller naming someone else's key is claiming an object it never uploaded.
  if (!body.data.r2Key.startsWith(`chat/${user.id}/`)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const media = await registerMedia({ ownerId: user.id, ...body.data });

  // INFO: The object is missing, or its stored type or size failed § 14. Either way there is nothing to point a message at.
  if (!media) {
    return NextResponse.json({ error: "unprocessable" }, { status: 422 });
  }

  return NextResponse.json({ media }, { status: 201 });
}
