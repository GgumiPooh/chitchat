import type { EventRecurrence } from "@/shared/lib";

/** REQUIREMENTS.md § 11. The calendar's endpoints. */
export const EVENTS_PATH = "/api/events";

/**
 * REQUIREMENTS.md § 11.1. The D-day count, the next milestone, and the upcoming
 * card, in one response.
 *
 * INFO: They are one endpoint rather than three because they are refetched
 * together — a tab focus after midnight invalidates all three at once (§ 11.1.).
 */
export const CALENDAR_SUMMARY_PATH = "/api/calendar/summary";

export const MAX_EVENT_TITLE_LENGTH = 60;

export const MAX_EVENT_DESCRIPTION_LENGTH = 500;

/**
 * DESIGN.md § 4.1.7. The closed colour set, stored in `events.color` by id.
 *
 * WARN: The id is stored, never the hex — `theme.css` owns the value, so the dark
 * theme (§ 5.2.) is a token swap rather than a data migration.
 */
export const EVENT_COLORS = ["clay", "honey", "olive", "teal", "blue", "plum"] as const;

export type EventColor = (typeof EVENT_COLORS)[number];

/** REQUIREMENTS.md § 11.4. The 반복 chips and the detail row's suffix, in the order the form offers them. */
export const EVENT_RECURRENCE_LABELS: Record<EventRecurrence, string> = {
  none: "반복 없음",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
};

export const EVENT_COLOR_LABELS: Record<EventColor, string> = {
  clay: "클레이",
  honey: "머스타드",
  olive: "올리브",
  teal: "틸",
  blue: "인디고",
  plum: "플럼",
};

// WARN: Written out rather than interpolated — Tailwind scans source text, so a `bg-event-${color}` template produces no CSS at all.
export const EVENT_COLOR_FILL_CLASSES: Record<EventColor, string> = {
  clay: "bg-event-clay",
  honey: "bg-event-honey",
  olive: "bg-event-olive",
  teal: "bg-event-teal",
  blue: "bg-event-blue",
  plum: "bg-event-plum",
};

export const EVENT_COLOR_RING_CLASSES: Record<EventColor, string> = {
  clay: "border-event-clay",
  honey: "border-event-honey",
  olive: "border-event-olive",
  teal: "border-event-teal",
  blue: "border-event-blue",
  plum: "border-event-plum",
};

/** DESIGN.md § 4.1.7. An event created without a colour, and the fallback for a value no longer in the set. */
export const EVENT_FALLBACK_FILL_CLASS = "bg-meta-soft";

export const EVENT_FALLBACK_RING_CLASS = "border-meta-soft";

export function isEventColor(value: unknown): value is EventColor {
  return EVENT_COLORS.includes(value as EventColor);
}

// INFO: The milestone constants are deliberately NOT here — they live in `shared/lib/date/calendar.ts` beside the arithmetic that reads them, because `shared/config` imports `shared/lib` and the reverse would be a cycle.

/** DESIGN.md § 7.9. A day cell shows at most this many dots however many events fall on it. */
export const MAX_DAY_EVENT_DOTS = 3;

// INFO: DESIGN.md § 7.9. Indexed by `toWeekday`, whose `SUNDAY`/`SATURDAY` live beside it in `shared/lib` — this is the copy, not the index.
export const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

/** DESIGN.md § 7.9. The upcoming list opens on this many events, on both screens. */
export const MAX_UPCOMING_EVENTS = 3;

// INFO: REQUIREMENTS.md § 11.5.1. 채팅's card pages by the opening count; 캘린더's section pages by more, its rows being on the document rather than in a floating card.
export const UPCOMING_EVENTS_PAGE_SIZE = 5;

/** REQUIREMENTS.md § 11.5.1. 채팅's side panel opens on this many and scrolls for the rest, a page at a time. */
export const SIDE_PANEL_UPCOMING_PAGE_SIZE = 20;

/**
 * REQUIREMENTS.md § 11.5. The one query parameter a delete notice taps through
 * with. There is deliberately no `event` counterpart — it outlives its `events`
 * row (§ 6.), so the day is the only destination it can name; every other notice
 * opens its event in place.
 */
export const CALENDAR_DAY_PARAM = "day";
