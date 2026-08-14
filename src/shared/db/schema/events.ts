import type { EventId, UserId } from "@/shared/lib";
import { boolean, index, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { users } from "./users";

// INFO: REQUIREMENTS.md § 6. Yearly only, for anniversaries — deliberately not a general RRULE engine.
export const eventRecurrenceEnum = pgEnum("event_recurrence", ["none", "yearly"]);

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
    createdBy: snowflake<UserId>("created_by")
      .notNull()
      .references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("events_starts_at_idx").on(table.startsAt)],
);

export type Event = typeof events.$inferSelect;

export type EventRecurrence = (typeof eventRecurrenceEnum.enumValues)[number];

export type EventScope = (typeof eventScopeEnum.enumValues)[number];
