// INFO: REQUIREMENTS.md § 16.'s mirror renders the same event line, and a page may not import a sibling page — so everything here lives in `shared/lib` and is re-exported for this slice's existing readers.
export { formatMultiDaySpan, formatOccurrenceTime, formatUpcomingWhen } from "@/shared/lib";
