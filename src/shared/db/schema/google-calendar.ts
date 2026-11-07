import type { EventId, UserId } from "@/shared/lib";
import { boolean, index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { snowflake } from "../types";
import { events } from "./events";
import { users } from "./users";

export const googleCalendarAccounts = pgTable("google_calendar_accounts", {
  userId: snowflake<UserId>("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  googleEmail: text("google_email").notNull(),
  encryptedRefreshToken: text("encrypted_refresh_token").notNull(),
  encryptedAccessToken: text("encrypted_access_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  defaultCalendarId: text("default_calendar_id").notNull().default("primary"),
  calendarListSyncToken: text("calendar_list_sync_token"),
  initialExportDone: boolean("initial_export_done").notNull().default(false),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  syncError: text("sync_error"),
  syncingUntil: timestamp("syncing_until", { withTimezone: true }),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const googleCalendarSources = pgTable(
  "google_calendar_sources",
  {
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    summary: text("summary").notNull(),
    backgroundColor: text("background_color"),
    accessRole: text("access_role").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    syncEnabled: boolean("sync_enabled").notNull().default(true),
    syncToken: text("sync_token"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.calendarId] })],
);

export const eventGoogleLinks = pgTable(
  "event_google_links",
  {
    eventId: snowflake<EventId>("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: snowflake<UserId>("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    calendarId: text("calendar_id").notNull(),
    googleEventId: text("google_event_id").notNull(),
    etag: text("etag"),
    recurringMasterGoogleId: text("recurring_master_google_id"),
    originalStartKey: text("original_start_key"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.userId] }),
    index("event_google_links_lookup_idx").on(table.userId, table.calendarId, table.googleEventId),
  ],
);

export type GoogleCalendarAccount = typeof googleCalendarAccounts.$inferSelect;
export type NewGoogleCalendarAccount = typeof googleCalendarAccounts.$inferInsert;
export type GoogleCalendarSourceRow = typeof googleCalendarSources.$inferSelect;
export type NewGoogleCalendarSourceRow = typeof googleCalendarSources.$inferInsert;
export type EventGoogleLink = typeof eventGoogleLinks.$inferSelect;
export type NewEventGoogleLink = typeof eventGoogleLinks.$inferInsert;
