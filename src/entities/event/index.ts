// WARN: The api segment is `server-only`, so a client module imports this barrel with `import type` alone — a value import drags it into the browser bundle (REQUIREMENTS.md § 2.). The calendar's pure date math lives in `shared/lib` for exactly that reason.
export { getCalendarSummary, getRelationshipStartDate } from "./api/get-summary";
export {
  hasEventOnDay,
  hasEventToday,
  listEventOccurrences,
  listUpcomingOccurrences,
} from "./api/list-events";
export {
  createEvent,
  deleteEvent,
  getEvent,
  updateEvent,
  type CreateEventParams,
  type UpdateEventParams,
} from "./api/write-event";
export { compareOccurrences, toOccurrencesInRange } from "./model/occurrences";
export { toCalendarEvent } from "./model/to-calendar-event";
export type { CalendarEvent, CalendarSummary, EventOccurrence } from "./model/types";
