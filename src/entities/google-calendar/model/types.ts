import type { EventColor } from "@/shared/config";
import type { EventRecurrence, EventScope, EventSource } from "@/shared/db";
import type { EventId, Nullable, UserId } from "@/shared/lib";

export type SyncableCalendarEvent = {
  allDay: boolean;
  color: Nullable<EventColor>;
  createdBy: UserId;
  description: Nullable<string>;
  endsAt: string;
  exdates: string[];
  iCalUid: Nullable<string>;
  isReadOnly: boolean;
  recurrence: EventRecurrence;
  recurrenceUntil: Nullable<string>;
  reminderEnabled: boolean;
  rrule: Nullable<string>;
  scope: EventScope;
  source: EventSource;
  startsAt: string;
  title: string;
  id: EventId;
};

export type GoogleCalendarConnection = {
  connectedAt: string;
  defaultCalendarId: string;
  googleEmail: string;
  initialExportDone: boolean;
  lastSyncedAt: Nullable<string>;
  syncError: Nullable<string>;
};

export type GoogleCalendarSource = {
  accessRole: string;
  backgroundColor: Nullable<string>;
  calendarId: string;
  isPrimary: boolean;
  isWritable: boolean;
  lastSyncedAt: Nullable<string>;
  summary: string;
  syncEnabled: boolean;
};

export type GoogleCalendarOverview = {
  account: Nullable<GoogleCalendarConnection>;
  sources: GoogleCalendarSource[];
};

export type GoogleCalendarSyncResult = {
  changed: boolean;
  deleted: number;
  exported: number;
  imported: number;
  lastSyncedAt: Nullable<string>;
  syncError: Nullable<string>;
  updated: number;
};
