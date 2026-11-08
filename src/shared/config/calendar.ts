import type { EventRecurrence, Nullable } from "@/shared/lib";

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

export const EVENT_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
  "custom",
] as const;

export const SELECTABLE_EVENT_RECURRENCES = [
  "none",
  "daily",
  "weekly",
  "monthly",
  "yearly",
] as const;

/** REQUIREMENTS.md § 11.4. The 반복 chips and the detail row's suffix, in the order the form offers them. */
export const EVENT_RECURRENCE_LABELS: Record<EventRecurrence, string> = {
  none: "안 함",
  daily: "매일",
  weekly: "매주",
  monthly: "매월",
  yearly: "매년",
  custom: "맞춤 반복",
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

export const EVENT_COLOR_TO_GOOGLE_COLOR: Record<EventColor, string> = {
  blue: "9",
  clay: "4",
  honey: "5",
  olive: "10",
  plum: "3",
  teal: "7",
};

const GOOGLE_COLOR_TO_EVENT_COLOR: Record<string, Nullable<EventColor>> = {
  "1": "plum",
  "2": "olive",
  "3": "plum",
  "4": "clay",
  "5": "honey",
  "6": "honey",
  "7": "teal",
  "8": null,
  "9": "blue",
  "10": "olive",
  "11": "clay",
};

export function toEventColorFromGoogle(
  googleColorId: Nullable<string>,
  calendarBackgroundHex?: Nullable<string>,
): Nullable<EventColor> {
  if (googleColorId) {
    return GOOGLE_COLOR_TO_EVENT_COLOR[googleColorId] ?? null;
  }
  if (!calendarBackgroundHex) {
    return null;
  }
  const match = /^#([0-9a-fA-F]{6})$/.exec(calendarBackgroundHex.trim());
  if (!match) {
    return null;
  }
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  const lightness = (max + min) / 2;

  const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));
  if (saturation < 0.18) {
    return null;
  }

  let hue = 0;
  if (delta !== 0) {
    if (max === r) {
      hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
    } else if (max === g) {
      hue = ((b - r) / delta + 2) * 60;
    } else {
      hue = ((r - g) / delta + 4) * 60;
    }
  }

  if (hue < 0) {
    hue += 360;
  }

  if (hue >= 345 || hue < 28) {
    return "clay";
  }
  if (hue < 68) {
    return "honey";
  }
  if (hue < 150) {
    return "olive";
  }
  if (hue < 198) {
    return "teal";
  }
  if (hue < 260) {
    return "blue";
  }
  return "plum";
}

/**
 * REQUIREMENTS.md § 11.8. Detects Google holiday virtual calendars.
 */
export function isHolidayCalendarId(calendarId: string): boolean {
  const normalized = calendarId.trim().toLowerCase();
  return (
    normalized.includes("holiday@group.v.calendar.google.com") ||
    normalized.includes("@holiday.calendar.google.com")
  );
}

/**
 * REQUIREMENTS.md § 11.8. Filters out Google virtual calendars that are not supported.
 *
 * INFO: Public holiday calendars and contacts/birthday calendars are allowed (sync_enabled defaults to false).
 * All other `@group.v.calendar.google.com` virtual calendars are excluded.
 */
export function isExcludedGoogleCalendarId(calendarId: string): boolean {
  const normalized = calendarId.trim().toLowerCase();

  const isHolidayCalendar = isHolidayCalendarId(calendarId);
  const isBirthdayCalendar =
    normalized.includes("contacts@group.v.calendar.google.com") ||
    normalized.includes("birthday@group.v.calendar.google.com") ||
    normalized.includes("birthdays@group.v.calendar.google.com") ||
    normalized.includes("#contacts@") ||
    normalized.includes("#birthday");

  if (isHolidayCalendar || isBirthdayCalendar) {
    return false;
  }

  return normalized.endsWith("@group.v.calendar.google.com");
}

/**
 * REQUIREMENTS.md § 11.7. Recognizes Google Calendar public holiday titles.
 * These are rendered natively by ChitChat's built-in holiday engine (red numerals,
 * static agenda row, no dot consumption), so they must not be duplicated as events.
 */
export function isGooglePublicHoliday(title: string): boolean {
  const norm = title.trim().toLowerCase().replace(/\s+/g, "");
  if (norm.includes("대체공휴일") || norm.includes("substituteholiday")) {
    return true;
  }
  return (
    norm === "신정" ||
    norm === "새해첫날" ||
    norm === "newyear'sday" ||
    norm === "newyearsday" ||
    norm === "설날전날" ||
    norm === "설날" ||
    norm === "설날다음날" ||
    norm === "설날연휴" ||
    norm === "lunarnewyear'sday" ||
    norm === "3·1절" ||
    norm === "3.1절" ||
    norm === "삼일절" ||
    norm === "independencemovementday" ||
    norm === "근로자의날" ||
    norm === "노동절" ||
    norm === "laborday" ||
    norm === "workers'day" ||
    norm === "어린이날" ||
    norm === "children'sday" ||
    norm === "부처님오신날" ||
    norm === "석가탄신일" ||
    norm === "buddha'sbirthday" ||
    norm === "현충일" ||
    norm === "memorialday" ||
    norm === "제헌절" ||
    norm === "constitutionday" ||
    norm === "광복절" ||
    norm === "nationalliberationday" ||
    norm === "추석전날" ||
    norm === "추석" ||
    norm === "추석다음날" ||
    norm === "추석연휴" ||
    norm === "chuseok" ||
    norm === "개천절" ||
    norm === "nationalfoundationday" ||
    norm === "한글날" ||
    norm === "hangeulday" ||
    norm === "hangulday" ||
    norm === "성탄절" ||
    norm === "기독탄신일" ||
    norm === "크리스마스" ||
    norm === "christmasday" ||
    norm === "임시공휴일" ||
    norm === "국회의원선거" ||
    norm === "대통령선거" ||
    norm === "지방선거"
  );
}

/**
 * REQUIREMENTS.md § 11.7. Curated, popular Korean non-public observances.
 * Kept visible as subtle agenda captions without cluttering the month grid with event dots.
 * Strictly exact match only — never partial match, to prevent hijacking user events like "어버이날 식사" or "안동 지사".
 */
export function isCuratedObservance(title: string): boolean {
  const norm = title.trim().toLowerCase().replace(/\s+/g, "");
  return (
    norm === "어버이날" ||
    norm === "parents'day" ||
    norm === "parentsday" ||
    norm === "스승의날" ||
    norm === "teachers'day" ||
    norm === "teachersday" ||
    norm === "성년의날" ||
    norm === "comingofageday" ||
    norm === "부부의날" ||
    norm === "marriedcouples'day" ||
    norm === "식목일" ||
    norm === "arborday" ||
    norm === "국군의날" ||
    norm === "armedforcesday" ||
    norm === "정월대보름" ||
    norm === "초복" ||
    norm === "중복" ||
    norm === "말복" ||
    norm === "동지" ||
    norm === "독도의날" ||
    norm === "농업인의날" ||
    norm === "빼빼로데이" ||
    norm === "밸런타인데이" ||
    norm === "발렌타인데이" ||
    norm === "valentine'sday" ||
    norm === "valentinesday" ||
    norm === "화이트데이" ||
    norm === "whiteday" ||
    norm === "크리스마스이브" ||
    norm === "christmaseve"
  );
}

/**
 * REQUIREMENTS.md § 11.8. Google places generic "생일 축하합니다!" / "Happy Birthday!"
 * greeting events on the user's primary calendar when the Google Account has a birthday.
 * When contacts/birthday calendar is synced, this results in duplicate birthdays alongside
 * the user's actual contact birthday ("천제희님의 생일").
 */
export function isGoogleBirthdayGreeting(event: {
  source?: Nullable<string>;
  title: string;
}): boolean {
  if (event.source !== "google") {
    return false;
  }
  const norm = event.title.trim().toLowerCase();
  return (
    norm === "생일 축하합니다!" ||
    norm === "생일 축하합니다" ||
    norm === "happy birthday!" ||
    norm === "happy birthday"
  );
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
