import type { CalendarEvent, CalendarSummary, EventOccurrence } from "@/entities/event";
import { request } from "@/shared/api";
import { CALENDAR_SUMMARY_PATH, EVENTS_PATH, type EventColor } from "@/shared/config";
import type { EventRecurrence, EventScope } from "@/shared/db";
import type { Nullable } from "@/shared/lib";

export type EventBody = {
  title: string;
  description: Nullable<string>;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  color: Nullable<EventColor>;
  recurrence: EventRecurrence;
  scope: EventScope;
};

export async function fetchOccurrences(fromKey: string, toKey: string): Promise<EventOccurrence[]> {
  const { occurrences } = await send<{ occurrences: EventOccurrence[] }>(
    `${EVENTS_PATH}?from=${fromKey}&to=${toKey}`,
    "GET",
  );

  return occurrences;
}

export async function fetchCalendarSummary(): Promise<CalendarSummary> {
  const { summary } = await send<{ summary: CalendarSummary }>(CALENDAR_SUMMARY_PATH, "GET");

  return summary;
}

export async function createEvent(body: EventBody): Promise<CalendarEvent> {
  const { event } = await send<{ event: CalendarEvent }>(EVENTS_PATH, "POST", body);

  return event;
}

export async function updateEvent(id: string, body: Partial<EventBody>): Promise<CalendarEvent> {
  const { event } = await send<{ event: CalendarEvent }>(`${EVENTS_PATH}/${id}`, "PATCH", body);

  return event;
}

export async function deleteEvent(id: string): Promise<void> {
  await send(`${EVENTS_PATH}/${id}`, "DELETE");
}

// WARN: Throws the response status as the message, matching `features/author-emoticon` — screens branch on `404`, which is how the other participant deleting the event mid-edit surfaces.
async function send<T = void>(path: string, method: string, body?: unknown): Promise<T> {
  const response = await request(path, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(String(response.status));
  }

  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}
