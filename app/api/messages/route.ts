import { getEmoticonItem } from "@/entities/emoticon";
import { ownsAllMedia } from "@/entities/media";
import {
  createEmoticonMessage,
  createMediaMessage,
  createTextMessage,
  listMessages,
  type ChatMessage,
} from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { getCurrentUser } from "@/shared/auth";
import {
  MAX_MEDIA_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  PUSH_BODY_MAX_LENGTH,
  isVideoMime,
} from "@/shared/config";
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

// INFO: REQUIREMENTS.md § 6. A row is text or attachments, never both — the CHECK constraint says the same thing at the database.
const bodySchema = z.union([
  z.object({
    clientMsgId: z.uuid(),
    text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  }),
  z.object({
    clientMsgId: z.uuid(),
    mediaIds: z.array(z.uuid()).min(1).max(MAX_MEDIA_PER_MESSAGE),
  }),
  // INFO: REQUIREMENTS.md § 13.6. One id and nothing else — selecting an emoticon sends it immediately, with no caption to carry.
  z.object({
    clientMsgId: z.uuid(),
    emoticonItemId: z.uuid(),
  }),
]);

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

  const payload = body.data;

  // INFO: The ids are only shaped by the schema above. `createMediaMessage` attaches them behind a foreign key, so an unregistered one would leave the route as a 500 rather than the 400 every other bad body gets.
  if ("mediaIds" in payload && !(await ownsAllMedia(payload.mediaIds, user.id))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // INFO: `messages.emoticon_item_id` is a foreign key like the media ids above — a picker holding a list the other participant has since deleted (§ 13.6.) would otherwise send its way into a 500.
  if ("emoticonItemId" in payload && !(await getEmoticonItem(payload.emoticonItemId))) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const message = await createMessage(user.id, payload);

  // INFO: The client id is already taken by a row this sender cannot claim, so echoing anything back would replace their optimistic bubble with a stranger's message.
  if (!message) {
    return NextResponse.json({ error: "conflict" }, { status: 409 });
  }

  // WARN: REQUIREMENTS.md § 16.1. `after`, so the fan-out's round trips to the push services never sit between the sender and their 201. It still runs inside this invocation, on a database that is already awake — which is why push costs Neon's autosuspend nothing, unlike the cron § 16.1. rejected.
  after(() => safelyRunAsync(() => notifyMessageRecipients(user, toPushBody(message))));

  return NextResponse.json({ message }, { status: 201 });
}

function createMessage(senderId: string, payload: z.infer<typeof bodySchema>) {
  if ("text" in payload) {
    return createTextMessage({ senderId, ...payload });
  }

  if ("mediaIds" in payload) {
    return createMediaMessage({ senderId, ...payload });
  }

  return createEmoticonMessage({ senderId, ...payload });
}

// INFO: A notification has no room for a thumbnail, so an attachment is announced by kind. `사진` covers a mixed send too — naming both would read as a manifest.
function toPushBody(message: ChatMessage): string {
  if (message.type === "emoticon") {
    // INFO: REQUIREMENTS.md § 16.1. The banner cannot show the art, and the item name is authored by these two users rather than by a vendor, so the kind is what carries.
    return "이모티콘";
  }

  if (message.type !== "media") {
    return (message.text ?? "").slice(0, PUSH_BODY_MAX_LENGTH);
  }

  return message.media.every((item) => isVideoMime(item.mime)) ? "동영상" : "사진";
}
