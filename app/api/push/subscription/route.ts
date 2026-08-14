import {
  deletePushSubscription,
  savePushSubscription,
  updatePushSubscriptionSound,
} from "@/entities/push-subscription";
import { apiError } from "@/shared/api";
import { getCurrentUser, getSessionContext } from "@/shared/auth";
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

const soundSchema = z.object({ endpoint: z.url(), soundEnabled: z.boolean() });

/**
 * REQUIREMENTS.md § 16.1. Idempotent — the client re-registers on every launch.
 *
 * INFO: Answers `200 { soundEnabled }` rather than the `204` it used to. 알림 소리 is
 * per installation, so the settings screen's server render cannot know it — the launch
 * re-registration is the one exchange that already identifies this device.
 */
export async function POST(request: Request) {
  // INFO: The session and not just the user (REQUIREMENTS.md § 12.) — the row is bound to the login it was registered under, and this is the exchange that knows both ends.
  const context = await getSessionContext();

  if (!context) {
    return apiError("unauthorized");
  }

  const body = subscriptionSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const saved = await savePushSubscription({
    userId: context.user.id,
    sessionId: context.session.id,
    ...body.data,
    userAgent: body.data.userAgent ?? null,
  });

  return NextResponse.json(saved);
}

/** REQUIREMENTS.md § 16.1. 알림 소리 for this installation alone. */
export async function PATCH(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = soundSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const isStored = await updatePushSubscriptionSound({ userId: user.id, ...body.data });

  // INFO: REQUIREMENTS.md § 16.1. A preference with no subscription row has nowhere to live, and the switch is disabled for exactly that state — so a miss here is a stale client rather than a legal no-op.
  if (!isStored) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = removalSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  // WARN: Scoped to the caller. An endpoint is unguessable, but this path has a session and nothing else stops one participant from retiring the other's device by naming its endpoint.
  await deletePushSubscription(body.data.endpoint, user.id);

  return new NextResponse(null, { status: 204 });
}
