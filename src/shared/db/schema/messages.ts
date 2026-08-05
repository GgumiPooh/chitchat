import { sql } from "drizzle-orm";
import {
  bigint,
  bigserial,
  check,
  index,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { emoticonItems } from "./emoticons";
import { events } from "./events";
import { media } from "./media";
import { users } from "./users";

// INFO: `media`, not `image` — REQUIREMENTS.md § 8.1. lets one bubble carry photos and videos together, so the discriminator is `media.mime`, not the message type.
export const messageTypeEnum = pgEnum("message_type", ["text", "media", "emoticon", "system"]);

// INFO: REQUIREMENTS.md § 11.5. Posted on create, reschedule, and delete — never on a title-only or description-only edit.
export const systemActionEnum = pgEnum("system_action", [
  "event_created",
  "event_rescheduled",
  "event_deleted",
]);

// INFO: REQUIREMENTS.md § 6. Append-only — marking messages read moves `users.last_read_at`, never a row here.
// INFO: REQUIREMENTS.md § 6. No `conversation_id`: there is one conversation, so the primary key on `id` is already the § 8.2. paging index.
export const messages = pgTable(
  "messages",
  {
    // INFO: REQUIREMENTS.md § 8.2. The ordering key and the pagination cursor; OFFSET paging is rejected outright.
    id: bigserial("id", { mode: "number" }).primaryKey(),
    // INFO: REQUIREMENTS.md § 8.7. The name and avatar are joined at render time, never copied onto the row.
    senderId: uuid("sender_id")
      .notNull()
      .references(() => users.id),
    type: messageTypeEnum("type").notNull(),
    text: text("text"),
    emoticonItemId: uuid("emoticon_item_id").references(() => emoticonItems.id),
    // WARN: `set null` — a deleted event still has its "deleted" system message, which then has nothing to navigate to.
    eventId: uuid("event_id").references(() => events.id, { onDelete: "set null" }),
    systemAction: systemActionEnum("system_action"),
    // INFO: REQUIREMENTS.md § 11.5. A snapshot, because a delete notice outlives its event row; the *user* name is still resolved at render time.
    eventTitle: text("event_title"),
    eventStartsAt: timestamp("event_starts_at", { withTimezone: true }),
    // INFO: REQUIREMENTS.md § 8.9. The quoted message is joined at read time, never snapshotted — a rename or an emoticon edit reaches the quote for the same reason § 8.7. reaches the bubble.
    // WARN: `set null` rather than cascade. Rows are only ever soft-deleted, so this fires for nothing the app does; a cascade would make a hard delete take every reply with it.
    replyToId: bigint("reply_to_id", { mode: "number" }).references(
      (): AnyPgColumn => messages.id,
      { onDelete: "set null" },
    ),
    // INFO: REQUIREMENTS.md § 8.5. Client-generated, so a retried send collides instead of inserting a duplicate.
    clientMsgId: uuid("client_msg_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  () => [
    // INFO: REQUIREMENTS.md § 6. Without this a `type = 'text'` row can silently acquire an emoticon or an event.
    check(
      "messages_type_payload_check",
      sql`CASE "type"
        WHEN 'text' THEN "text" IS NOT NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL
        WHEN 'media' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL
        WHEN 'emoticon' THEN "text" IS NULL AND "emoticon_item_id" IS NOT NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL
        WHEN 'system' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "system_action" IS NOT NULL AND "event_title" IS NOT NULL AND "event_starts_at" IS NOT NULL
      END`,
    ),
    // INFO: REQUIREMENTS.md § 8.9. A system notice is timeline furniture rather than someone speaking (DESIGN.md § 6.5.), so nothing may quote from it. Its own column is left out of the CASE above deliberately — `reply_to_id` is legal on all three of the other types, so folding it in would have meant restating each branch.
    check("messages_system_no_reply_check", sql`"type" <> 'system' OR "reply_to_id" IS NULL`),
  ],
);

// INFO: REQUIREMENTS.md § 6. One bubble is one `messages` row however many images it carries, which is why `messages` has no `media_id`.
export const messageMedia = pgTable(
  "message_media",
  {
    messageId: bigint("message_id", { mode: "number" })
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    // TODO: Decide the delete behaviour with § 18 #1 — gallery deletion may need `media.deleted_at` instead of a cascade.
    mediaId: uuid("media_id")
      .notNull()
      .references(() => media.id),
    // INFO: REQUIREMENTS.md § 6. Preserves the order the sender picked; without it the grid rearranges between queries.
    sortOrder: smallint("sort_order").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.messageId, table.sortOrder] }),
    // WARN: The primary key does not cover `media_id`, so § 10.'s "jump to where this image was sent" and every FK check on a `media` delete would seq-scan without this.
    index("message_media_media_id_idx").on(table.mediaId),
  ],
);

export type Message = typeof messages.$inferSelect;

export type MessageMedia = typeof messageMedia.$inferSelect;

export type MessageType = (typeof messageTypeEnum.enumValues)[number];

export type SystemAction = (typeof systemActionEnum.enumValues)[number];
