import { getEmoticonItem } from "@/entities/emoticon";
import { ownsAllMedia } from "@/entities/media";
import {
  areInlineEmoticonsKnown,
  createEmoticonMessage,
  createMediaMessage,
  createTextMessage,
  isQuotable,
  listMessages,
  toMessagePayload,
  toSingleMessagePayload,
  type ChatMessage,
} from "@/entities/message";
import { notifyMessageRecipients } from "@/features/notify-chat";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  isMessageContentPaired,
  MAX_EMOTICON_ID_LOOKUP,
  MAX_MEDIA_PER_MESSAGE,
  MAX_MESSAGE_LENGTH,
  MAX_MESSAGE_PAGE_SIZE,
  MESSAGE_PAGE_SIZE,
  PUSH_BODY_MAX_LENGTH,
  snowflakeCursorSchema,
  snowflakeSchema,
  toMediaLabel,
  toMediaNoun,
  toMessageSummary,
  toSoloInlineEmoticonId,
} from "@/shared/config";
import {
  safelyRunAsync,
  type EmoticonItemId,
  type MediaId,
  type MessageId,
  type Optional,
  type UserId,
} from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const cursorSchema = snowflakeSchema<MessageId>().optional();

// INFO: REQUIREMENTS.md § 8.4. Zero is a real `after` cursor — a client whose window is still empty catches up from the start of the conversation rather than from the newest page, which would strand everything behind it.
const afterCursorSchema = snowflakeCursorSchema<MessageId>().optional();

const querySchema = z.object({
  before: cursorSchema,
  after: afterCursorSchema,
  around: cursorSchema,
  limit: z.coerce.number().int().positive().optional(),
});

// INFO: REQUIREMENTS.md § 8.10. Orthogonal to the payload, so it rides on every branch of the union below rather than forming one of its own.
const replySchema = z.object({ replyToId: snowflakeSchema<MessageId>().optional() });

// INFO: REQUIREMENTS.md § 6. A row is text or attachments, never both — the CHECK constraint says the same thing at the database.
// INFO: REQUIREMENTS.md § 13. Bounded by the lookup the existence check runs — a body past it is refused rather than checked in part.
const inlineEmoticonsSchema = z
  .array(snowflakeSchema<EmoticonItemId>())
  .max(MAX_EMOTICON_ID_LOOKUP)
  .optional();

const bodySchema = z.union([
  replySchema
    .extend({
      clientMsgId: z.uuid(),
      text: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
      inlineEmoticonItemIds: inlineEmoticonsSchema,
    })
    // WARN: REQUIREMENTS.md § 13. One id per placeholder, refused rather than repaired — the pair is positional, so a body whose halves disagree names emoticons the sender never wrote and cannot be guessed back into shape.
    .refine((body) =>
      isMessageContentPaired({
        text: body.text,
        inlineEmoticonItemIds: body.inlineEmoticonItemIds ?? [],
      }),
    ),
  replySchema.extend({
    clientMsgId: z.uuid(),
    mediaIds: z.array(snowflakeSchema<MediaId>()).min(1).max(MAX_MEDIA_PER_MESSAGE),
  }),
  // INFO: REQUIREMENTS.md § 13.6. One id and nothing else — an emoticon carries no caption of its own.
  replySchema.extend({
    clientMsgId: z.uuid(),
    emoticonItemId: snowflakeSchema<EmoticonItemId>(),
  }),
]);

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
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

  const { before, after, around, limit } = query.data;

  // INFO: REQUIREMENTS.md § 13. Through the payload builder, which is what pairs the page with the emoticons its text stands in — every read path answers this one shape.
  return NextResponse.json(
    await toMessagePayload(
      await listMessages({
        before,
        after,
        around,
        limit: Math.min(limit ?? MESSAGE_PAGE_SIZE, MAX_MESSAGE_PAGE_SIZE),
      }),
    ),
  );
}

export async function POST(request: Request) {
  const user = await getCurrentUser({ allowShareKey: true });

  if (!user) {
    return apiError("unauthorized");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const payload = body.data;

  // INFO: The ids are only shaped by the schema above. `createMediaMessage` attaches them behind a foreign key, so an unregistered one would leave the route as a 500 rather than the 400 every other bad body gets.
  if ("mediaIds" in payload && !(await ownsAllMedia(payload.mediaIds, user.id, "chat"))) {
    return apiError("invalid_request");
  }

  // INFO: `messages.emoticon_item_id` is a foreign key like the media ids above — a picker holding a list the other participant has since deleted (§ 13.6.) would otherwise send its way into a 500.
  if ("emoticonItemId" in payload && !(await getEmoticonItem(payload.emoticonItemId))) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 13. The array carries no foreign key of its own, so a stale client naming an item that never existed would be stored rather than refused — this is what makes it the 400 the two checks above give.
  if ("text" in payload && !(await areInlineEmoticonsKnown(payload.inlineEmoticonItemIds ?? []))) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 8.10. `reply_to_id` is a foreign key and a CHECK refuses a system parent, so either would surface as a 500 without this. A soft-deleted parent is refused here rather than at the database — the row is still there, so nothing but this stops a stale client quoting it.
  if (!(await canReplyTo(payload.replyToId))) {
    return apiError("invalid_request");
  }

  const message = await createMessage(user.id, payload);

  // INFO: The client id is already taken by a row this sender cannot claim, so echoing anything back would replace their optimistic bubble with a stranger's message.
  if (!message) {
    return apiError("conflict");
  }

  // INFO: REQUIREMENTS.md § 13. The echo carries the same map a page does, so the sender's own row draws from what the server resolved rather than from whatever the composer happened to hold.
  const echo = await toSingleMessagePayload(message);

  // WARN: REQUIREMENTS.md § 16.1. `after`, so the fan-out's round trips to the push services never sit between the sender and their 201. It still runs inside this invocation, on a database that is already awake — which is why push costs Neon's autosuspend nothing, unlike the cron § 16.1. rejected.
  after(() => safelyRunAsync(() => notifyMessageRecipients(user, toPushBody(message))));

  return NextResponse.json(echo, { status: 201 });
}

async function canReplyTo(replyToId: Optional<MessageId>): Promise<boolean> {
  return replyToId === undefined || isQuotable(replyToId);
}

function createMessage(senderId: UserId, payload: z.infer<typeof bodySchema>) {
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
  if (message.type === "media") {
    return toMediaLabel(toMediaNoun(message.media));
  }

  // INFO: REQUIREMENTS.md § 16.1. The banner cannot show the art, and the item name is authored by these two users rather than by a vendor, so the kind is what carries.
  // INFO: § 13. A mini sent alone is `text` rather than `emoticon`, and reads as the kind too — the parentheses below mark a substitution *inside* a sentence, and a message that is one emoticon and nothing else has none. `toReplySummary` draws the same line for the same reason, so a quote and a banner cannot disagree about the same message.
  if (message.type === "emoticon" || isSoloMini(message)) {
    return "이모티콘";
  }

  // INFO: REQUIREMENTS.md § 13. A banner has no room to draw one either, so every placeholder reads as `(이모티콘)` inside whatever sentence carries it.
  return toMessageSummary(message.text ?? "").slice(0, PUSH_BODY_MAX_LENGTH);
}

function isSoloMini({ text, inlineEmoticonItemIds }: ChatMessage): boolean {
  return toSoloInlineEmoticonId({ text: text ?? "", inlineEmoticonItemIds }) !== null;
}
