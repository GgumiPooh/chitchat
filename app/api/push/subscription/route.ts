import { deletePushSubscription, savePushSubscription } from "@/entities/push-subscription";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const subscriptionSchema = z.object({
  endpoint: z.url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1),
  // INFO: REQUIREMENTS.md § 16.1. Labels the row in a future device list; nothing reads it yet, so a browser that withholds it costs nothing.
  userAgent: z.string().max(512).nullish(),
});

const removalSchema = z.object({ endpoint: z.url() });

/** REQUIREMENTS.md § 16.1. Idempotent — the client re-registers on every launch. */
export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = subscriptionSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  await savePushSubscription({
    userId: user.id,
    ...body.data,
    userAgent: body.data.userAgent ?? null,
  });

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = removalSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // WARN: Scoped to the caller. An endpoint is unguessable, but this path has a session and nothing else stops one participant from retiring the other's device by naming its endpoint.
  await deletePushSubscription(body.data.endpoint, user.id);

  return new NextResponse(null, { status: 204 });
}
