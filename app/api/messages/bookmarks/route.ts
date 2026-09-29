import {
  listAllMessageBookmarkIds,
  listMessageBookmarks,
  removeAllMessageBookmarks,
} from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { BOOKMARK_PAGE_SIZE, snowflakeSchema } from "@/shared/config";
import type { MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  before: snowflakeSchema<MessageId>().optional(),
  hideOthers: z.coerce.boolean().optional().default(false),
});

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

  const { before, hideOthers } = query.data;

  const [bookmarks, allIds] = await Promise.all([
    listMessageBookmarks({
      userId: user.id,
      hideOthers,
      before,
      limit: BOOKMARK_PAGE_SIZE,
    }),
    before === undefined ? listAllMessageBookmarkIds(user.id, hideOthers) : undefined,
  ]);

  return NextResponse.json({
    bookmarks,
    allIds,
    hasMore: bookmarks.length >= BOOKMARK_PAGE_SIZE,
  });
}

export async function DELETE() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  await removeAllMessageBookmarks(user.id);

  return new NextResponse(null, { status: 204 });
}
