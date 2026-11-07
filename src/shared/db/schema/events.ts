import type { EventId, EventRecurrence, UserId } from "@/shared/lib";
import { sql } from "drizzle-orm";
import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

export type { EventRecurrence } from "@/shared/lib";

// WARN: Typed against `shared/lib`'s union so the column and `projectRecurrence` cannot drift apart.
const EVENT_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const satisfies readonly EventRecurrence[];
export const eventRecurrenceEnum = pgEnum("event_recurrence", EVENT_RECURRENCES);

export const eventSourceEnum = pgEnum("event_source", ["jandh", "google"]);
export type EventSource = (typeof eventSourceEnum.enumValues)[number];

// INFO: REQUIREMENTS.md § 11.5. A distinction ("I'm busy that day"), not a privacy control — `mine` stays visible to the other user.
export const eventScopeEnum = pgEnum("event_scope", ["shared", "mine"]);

// INFO: REQUIREMENTS.md § 11.2. The relationship start date and its derived anniversaries are not rows here.
export const events = pgTable(
  "events",
  {
    id: snowflake<EventId>("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    allDay: boolean("all_day").notNull().default(false),
    // TODO: Constrain to the event colour set once § 18 #4 is decided; null renders the default marker until then.
    color: text("color"),
    recurrence: eventRecurrenceEnum("recurrence").notNull().default("none"),
    recurrenceUntil: text("recurrence_until"),
    rrule: text("rrule"),
    exdates: text("exdates")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    source: eventSourceEnum("source").notNull().default("jandh"),
    isReadOnly: boolean("is_read_only").notNull().default(false),
    iCalUid: text("i_cal_uid"),
    scope: eventScopeEnum("scope").notNull().default("shared"),
    // INFO: REQUIREMENTS.md § 16.3. Per event and not per user, since both users edit every event; `false` silences the reminder run for it.
    reminderEnabled: boolean("reminder_enabled").notNull().default(true),
    createdBy: snowflake<UserId>("created_by")
      .notNull()
      .references(() => users.id),
    // INFO: REQUIREMENTS.md § 16.3. When this row last raised a reminder. One column carries all three thresholds because they only ever fire in order, so the instant itself says how far the sequence has got.
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("events_starts_at_idx").on(table.startsAt),
    index("events_i_cal_uid_idx").on(table.iCalUid),
  ],
);

export type Event = typeof events.$inferSelect;

export type EventScope = (typeof eventScopeEnum.enumValues)[number];
