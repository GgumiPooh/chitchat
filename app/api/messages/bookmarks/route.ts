import { listMessageBookmarks } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({ hideOthers: z.coerce.boolean().optional().default(false) });

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

  const bookmarks = await listMessageBookmarks({
    userId: user.id,
    hideOthers: query.data.hideOthers,
  });

  return NextResponse.json({ bookmarks });
}
