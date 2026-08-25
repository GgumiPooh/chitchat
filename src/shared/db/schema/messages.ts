import type { EmoticonItemId, EventId, MediaId, MessageId, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import {
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
import { snowflake } from "../types";
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
  // INFO: REQUIREMENTS.md § 16.3. Nobody performed this one — the reminder run posts it, so it is rendered without an actor.
  "event_reminder",
  // INFO: The AI's answer to a question asked in chat. `sender_id` stays the asker — this is the one system action with a real actor.
  "assistant_reply",
]);

// INFO: REQUIREMENTS.md § 6. Append-only — marking messages read moves `users.last_read_at`, never a row here.
// INFO: REQUIREMENTS.md § 6. No `conversation_id`: there is one conversation, so the primary key on `id` is already the § 8.2. paging index.
export const messages = pgTable(
  "messages",
  {
    // INFO: REQUIREMENTS.md § 8.2. The ordering key and the pagination cursor; OFFSET paging is rejected outright.
    id: snowflake<MessageId>("id").primaryKey(),
    // INFO: REQUIREMENTS.md § 8.7. The name and avatar are joined at render time, never copied onto the row.
    senderId: snowflake<UserId>("sender_id")
      .notNull()
      .references(() => users.id),
    type: messageTypeEnum("type").notNull(),
    text: text("text"),
    emoticonItemId: snowflake<EmoticonItemId>("emoticon_item_id").references(
      () => emoticonItems.id,
    ),
    // INFO: REQUIREMENTS.md § 13. One id per U+FFFC in `text`, in that order and repeats included, so every message written before this column is already a valid empty case.
    // WARN: Not a foreign key, and it cannot become one — Postgres constrains no array element. A deleted item keeps its `emoticon_items` row (§ 13.) precisely so the id here still resolves to a box.
    inlineEmoticonItemIds: text("inline_emoticon_item_ids")
      .array()
      .$type<EmoticonItemId[]>()
      .notNull()
      .default([]),
    // WARN: `set null` — a deleted event still has its "deleted" system message, which then has nothing to navigate to.
    eventId: snowflake<EventId>("event_id").references(() => events.id, { onDelete: "set null" }),
    systemAction: systemActionEnum("system_action"),
    // INFO: REQUIREMENTS.md § 11.5. A snapshot, because a delete notice outlives its event row; the *user* name is still resolved at render time.
    eventTitle: text("event_title"),
    eventStartsAt: timestamp("event_starts_at", { withTimezone: true }),
    // INFO: A snapshot of the `llm_agents` row that answered, taken at answer time — `llm_agents` carries no id of its own (its primary key is `provider`/`model`/`api_key`), and a key can rotate or be deleted without taking the row's own history of who answered with it.
    llmProvider: text("llm_provider"),
    llmModel: text("llm_model"),
    // INFO: REQUIREMENTS.md § 8.10. The quoted message is joined at read time, never snapshotted — a rename or an emoticon edit reaches the quote for the same reason § 8.7. reaches the bubble.
    // WARN: `set null` rather than cascade. Rows are only ever soft-deleted, so this fires for nothing the app does; a cascade would make a hard delete take every reply with it.
    replyToId: snowflake<MessageId>("reply_to_id").references((): AnyPgColumn => messages.id, {
      onDelete: "set null",
    }),
    // INFO: REQUIREMENTS.md § 8.5. Client-generated, so a retried send collides instead of inserting a duplicate.
    // WARN: The one id in the schema that is not a snowflake (§ 6.), and it cannot become one: a browser has no machine number to mint with, and a collision here is read as "that retry already landed" — so it would drop a real message rather than fail an INSERT.
    clientMsgId: uuid("client_msg_id").notNull().unique(),
    // INFO: REQUIREMENTS.md § 8.13. NULL is "never edited", which is the whole 수정됨 test — an `updated_at` bumped by the soft delete beside it would light the label on a row nobody edited.
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // INFO: REQUIREMENTS.md § 8.13. The resume reconciliation reads exactly this predicate, and a partial index over it stays tiny — an edit or a delete is rare beside the rows they are indexed out of.
    index("messages_changed_id_idx")
      .on(table.id)
      .where(sql`"deleted_at" IS NOT NULL OR "edited_at" IS NOT NULL`),
    // INFO: REQUIREMENTS.md § 6. Without this a `type = 'text'` row can silently acquire an emoticon or an event.
    // WARN: `"system_action"::text` rather than a bare enum comparison — `db:migrate` applies every pending file in one transaction, and Postgres refuses to compare against an enum value added earlier in that same transaction. Casting to `text` sidesteps the restriction entirely, so this check never cares whether `'assistant_reply'` was just added or has been there for years.
    check(
      "messages_type_payload_check",
      sql`CASE "type"
        WHEN 'text' THEN "text" IS NOT NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
        WHEN 'media' THEN "text" IS NULL AND "emoticon_item_id" IS NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
        WHEN 'emoticon' THEN "text" IS NULL AND "emoticon_item_id" IS NOT NULL AND "event_id" IS NULL AND "system_action" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL
        WHEN 'system' THEN "emoticon_item_id" IS NULL AND (
          ("system_action"::text = 'assistant_reply' AND "text" IS NOT NULL AND "event_id" IS NULL AND "event_title" IS NULL AND "event_starts_at" IS NULL AND "llm_provider" IS NOT NULL AND "llm_model" IS NOT NULL)
          OR
          ("system_action" IS NOT NULL AND "system_action"::text <> 'assistant_reply' AND "text" IS NULL AND "event_title" IS NOT NULL AND "event_starts_at" IS NOT NULL AND "llm_provider" IS NULL AND "llm_model" IS NULL)
        )
      END`,
    ),
    // INFO: REQUIREMENTS.md § 8.10. A system notice is timeline furniture rather than someone speaking (DESIGN.md § 6.5.), so nothing may quote from it. Its own column is left out of the CASE above deliberately — `reply_to_id` is legal on all three of the other types, so folding it in would have meant restating each branch.
    // INFO: REQUIREMENTS.md § 8.15. An `assistant_reply` is the one system row that quotes — it points at the question it answers, which is what `DESIGN.md § 6.11.` draws in its bubble.
    check(
      "messages_system_no_reply_check",
      sql`"type" <> 'system' OR "system_action"::text = 'assistant_reply' OR "reply_to_id" IS NULL`,
    ),
    // INFO: REQUIREMENTS.md § 8.13. Only text is editable — an attachment and an emoticon carry no prose to correct, and a system notice is timeline furniture (DESIGN.md § 6.5.).
    check("messages_edited_is_text_check", sql`"edited_at" IS NULL OR "type" = 'text'`),
    // INFO: Left out of the CASE above for the reason the two checks beside it are — it constrains one branch, and folding it in would mean restating all four.
    check(
      "messages_inline_emoticons_are_text_check",
      sql`"type" = 'text' OR cardinality("inline_emoticon_item_ids") = 0`,
    ),
  ],
);

// INFO: REQUIREMENTS.md § 6. One bubble is one `messages` row however many images it carries, which is why `messages` has no `media_id`.
export const messageMedia = pgTable(
  "message_media",
  {
    messageId: snowflake<MessageId>("message_id")
      .notNull()
      .references(() => messages.id, { onDelete: "cascade" }),
    // TODO: Decide the delete behaviour with § 18 #1 — library deletion may need `media.deleted_at` instead of a cascade.
    mediaId: snowflake<MediaId>("media_id")
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
