import { markUserRead } from "@/entities/user";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const bodySchema = z.object({
  lastSeenMessageId: snowflakeSchema<MessageId>(),
});

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  await markUserRead(user.id, body.data.lastSeenMessageId);

  // INFO: REQUIREMENTS.md § 8.8. Nothing to return — the write fires `read_cursor`, and both devices learn the new cursor over the stream.
  return new NextResponse(null, { status: 204 });
}
