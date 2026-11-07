import type { GoogleCalendarOverview, GoogleCalendarSyncResult } from "@/entities/google-calendar";
import { request } from "@/shared/api";
import {
  GOOGLE_CALENDAR_ACCOUNT_PATH,
  GOOGLE_CALENDAR_SOURCES_PATH,
  GOOGLE_CALENDAR_SYNC_PATH,
} from "@/shared/config";

export async function fetchGoogleCalendarOverview(options?: {
  refresh?: boolean;
}): Promise<GoogleCalendarOverview> {
  const path = options?.refresh
    ? `${GOOGLE_CALENDAR_SOURCES_PATH}?refresh=1`
    : GOOGLE_CALENDAR_SOURCES_PATH;
  const response = await request(path, { method: "GET" });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return (await response.json()) as GoogleCalendarOverview;
}

export async function updateDefaultGoogleCalendar(
  defaultCalendarId: string,
): Promise<GoogleCalendarOverview> {
  const response = await request(GOOGLE_CALENDAR_ACCOUNT_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ defaultCalendarId }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${GOOGLE_CALENDAR_ACCOUNT_PATH} failed with ${response.status}`);
  }

  return (await response.json()) as GoogleCalendarOverview;
}

export async function updateGoogleCalendarSources(
  sources: { calendarId: string; syncEnabled: boolean }[],
): Promise<GoogleCalendarOverview> {
  const response = await request(GOOGLE_CALENDAR_SOURCES_PATH, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sources }),
  });

  if (!response.ok) {
    throw new Error(`PATCH ${GOOGLE_CALENDAR_SOURCES_PATH} failed with ${response.status}`);
  }

  return (await response.json()) as GoogleCalendarOverview;
}

export async function disconnectGoogleCalendar(): Promise<void> {
  const response = await request(GOOGLE_CALENDAR_ACCOUNT_PATH, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(`DELETE ${GOOGLE_CALENDAR_ACCOUNT_PATH} failed with ${response.status}`);
  }
}

export async function syncGoogleCalendar(): Promise<GoogleCalendarSyncResult> {
  const response = await request(GOOGLE_CALENDAR_SYNC_PATH, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`POST ${GOOGLE_CALENDAR_SYNC_PATH} failed with ${response.status}`);
  }

  return (await response.json()) as GoogleCalendarSyncResult;
}
