import { markUserRead } from "@/entities/user";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
export async function POST() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  await markUserRead(user.id);

  // INFO: REQUIREMENTS.md § 8.8. Nothing to return — the write fires `user_changed`, and both devices learn the new cursor over the stream.
  return new NextResponse(null, { status: 204 });
}
