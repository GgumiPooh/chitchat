export { toGridRange, type MonthCell } from "./model/build-month-grid";
export {
  AgendaEventRow,
  AgendaStaticRow,
  type AgendaEventRowProps,
  type AgendaStaticRowProps,
} from "./ui/agenda-row";
export { CalendarMonth, type CalendarMonthProps } from "./ui/calendar-month";
// INFO: REQUIREMENTS.md § 16.2. Re-exported from `shared/ui` — `widgets/upcoming-events` draws these rows too, and a widget may not cross-import another widget's slice.
export {
  EventDot,
  EventMemo,
  HolidayDot,
  MilestoneDot,
  type EventDotProps,
  type EventMemoProps,
  type HolidayDotProps,
  type MilestoneDotProps,
} from "@/shared/ui";
export {
  UPCOMING_HEADING_ID,
  UpcomingEmptyRow,
  UpcomingEventRow,
  UpcomingSection,
  type UpcomingEmptyRowProps,
  type UpcomingEventRowProps,
  type UpcomingSectionProps,
} from "./ui/upcoming-row";
export { WeekdayHeader, type WeekdayHeaderProps } from "./ui/weekday-header";
