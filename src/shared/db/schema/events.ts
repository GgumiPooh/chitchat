import type { EventId, EventRecurrence, UserId } from "@/shared/lib";
import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

export type { EventRecurrence } from "@/shared/lib";

// WARN: Typed against `shared/lib`'s union so the column and `projectRecurrence` cannot drift apart.
const EVENT_RECURRENCES = [
  "none",
  "weekly",
  "monthly",
  "yearly",
] as const satisfies readonly EventRecurrence[];
export const eventRecurrenceEnum = pgEnum("event_recurrence", EVENT_RECURRENCES);

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
    scope: eventScopeEnum("scope").notNull().default("shared"),
    // INFO: REQUIREMENTS.md § 16.3. Per event and not per user, since both users edit every event; `false` silences the reminder run for it.
    reminderEnabled: boolean("reminder_enabled").notNull().default(true),
    createdBy: snowflake<UserId>("created_by")
      .notNull()
      .references(() => users.id),
    // INFO: REQUIREMENTS.md § 16.3. When this row last raised a reminder. One column carries all three thresholds because they only ever fire in order, so the instant itself says how far the sequence has got.
    notifiedAt: timestamp("notified_at", { withTimezone: true }),
  },
  (table) => [index("events_starts_at_idx").on(table.startsAt)],
);

export type Event = typeof events.$inferSelect;

export type EventScope = (typeof eventScopeEnum.enumValues)[number];
