import { listConversationMedia } from "@/entities/media";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MediaId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z
  .object({
    // INFO: REQUIREMENTS.md § 8.1. The slide the reader tapped. The window is centred on it.
    around: snowflakeSchema<MediaId>().optional(),
    // INFO: REQUIREMENTS.md § 8.1. The track's oldest and newest loaded slides — the two edges it pages past as the reader nears them.
    before: snowflakeSchema<MediaId>().optional(),
    after: snowflakeSchema<MediaId>().optional(),
  })
  // INFO: Exactly one, never a default. A request with no anchor names no position to answer from, and one naming two is a client that has confused a window with a page — `listConversationMedia` would silently prefer `around` and the caller would never learn its cursor was ignored.
  .refine(
    ({ around, before, after }) => [around, before, after].filter(Boolean).length === 1,
    "anchor_required",
  );

/**
 * REQUIREMENTS.md § 8.1. The § 7.10. viewer's track in 채팅 — the conversation's
 * photos and videos around the one the reader tapped, and the pages that extend it
 * at either edge.
 *
 * INFO: AGENTS.md § 6.4. A Route Handler answers its own 401; the App Router does
 * not honour a thrown `Response`.
 *
 * WARN: No per-row read check beyond `listConversationMedia`'s own `currentUserId`
 * filter, and none further is owed. The conversation is shared (§ 6.), so every row
 * this can return either carries no `only_me` at all or is the caller's own
 * (REQUIREMENTS.md § 16.1.) — the same visibility `listMessages` and § 10.'s library
 * listing already apply. `canReadMedia` guards the **object** on top of that, and
 * that is `GET /api/media/{id}`'s job on each slide the viewer actually loads.
 *
 * INFO: An anchor that resolves to nothing answers `200` with an empty track rather than a 404. It is not a missing id — it is a message withdrawn between the tap and this request (§ 8.13.), and the viewer is being closed by the stream anyway.
 * INFO: An empty page at an edge is the same `200`, and it is how the client learns that edge is exhausted — `useViewerTrack` latches on a page that did not fill.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return apiError("invalid_request");
  }

  return NextResponse.json({
    media: await listConversationMedia({ ...query.data, currentUserId: user.id }),
  });
}
