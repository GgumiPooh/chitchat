import { countUnreadMessages } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 8.8. The tab-bar badge's authoritative count. The shell keeps
 * a running total off the stream and replaces it with this on every resume, which
 * is the only thing that can know what arrived while the stream was closed.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  return NextResponse.json({ unreadCount: await countUnreadMessages(user.id) });
}
