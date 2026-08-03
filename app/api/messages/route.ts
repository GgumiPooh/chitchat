import { countUnreadMessages, createTextMessage, listMessages } from "@/entities/message";
import { pushToUser, type PushPayload } from "@/entities/push-subscription";
import { listUsers, resolveDisplayName } from "@/entities/user";
import { getCurrentUser } from "@/shared/auth";
import {
  CHAT_ROUTE,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  PUSH_BODY_MAX_LENGTH,
} from "@/shared/config";
import type { User } from "@/shared/db";
import { safelyRunAsync } from "@/shared/lib";
import { NextResponse, after } from "next/server";
import { z } from "zod";

const cursorSchema = z.coerce.number().int().positive().optional();

// INFO: REQUIREMENTS.md § 8.4. Zero is a real `after` cursor — a client whose window is still empty catches up from the start of the conversation rather than from the newest page, which would strand everything behind it.
const afterCursorSchema = z.coerce.number().int().nonnegative().optional();

const querySchema = z.object({
  before: cursorSchema,
  after: afterCursorSchema,
  around: cursorSchema,
  limit: z.coerce.number().int().positive().optional(),
});

const bodySchema = z.object({
  clientMsgId: z.uuid(),
  text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { before, after, around, limit } = query.data;

  return NextResponse.json({
    messages: await listMessages({
      before,
      after,
      around,
      limit: Math.min(limit ?? MESSAGE_PAGE_SIZE, MAX_MESSAGE_PAGE_SIZE),
    }),
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const message = await createTextMessage({ senderId: user.id, ...body.data });

  // INFO: The client id is already taken by a row this sender cannot claim, so echoing anything back would replace their optimistic bubble with a stranger's message.
  if (!message) {
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }

  // WARN: REQUIREMENTS.md § 16.1. `after`, so the fan-out's round trips to the push services never sit between the sender and their 201. It still runs inside this invocation, on a database that is already awake — which is why push costs Neon's autosuspend nothing, unlike the cron § 16.1. rejected.
  after(() => safelyRunAsync(() => notifyRecipients(user, message.text ?? "")));

  return NextResponse.json({ message }, { status: 201 });
}

/**
 * REQUIREMENTS.md § 16.1. One banner per recipient device, carrying that
 * recipient's own unread count for the app icon badge (§ 8.8.).
 */
async function notifyRecipients(sender: User, text: string) {
  const recipients = (await listUsers()).filter((participant) => participant.id !== sender.id);
  // WARN: § 8.7. bans copying a name onto a stored row, not onto a notification. A banner is a point-in-time artifact the service worker cannot re-resolve — it holds no session and cannot query.
  const title = resolveDisplayName(sender);

  await Promise.all(
    recipients.map(async (recipient) => {
      const payload: PushPayload = {
        title,
        body: text.slice(0, PUSH_BODY_MAX_LENGTH),
        unreadCount: await countUnreadMessages(recipient.id),
        url: CHAT_ROUTE,
      };

      await pushToUser(recipient.id, payload);
    }),
  );
}
