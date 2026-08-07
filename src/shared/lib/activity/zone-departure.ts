/**
 * REQUIREMENTS.md § 13.7. A note that the departure about to happen is a crossing
 * into the emoticons zone, not a user leaving the app.
 *
 * § 8.4.1. cannot tell the two apart on its own: both blur the window, both go
 * dormant, and both come back through `pageshow`. It deliberately refuses to wake
 * on a return, so without this the 절전 모드 overlay landed over a screen the user
 * never felt they had left — their own 뒤로 having already asked for it back.
 *
 * WARN: `sessionStorage`, not a module flag like `isDormant` beside it. The whole
 * point is to survive a document navigation, which unloads every module in the
 * page. It is per-tab and dies with the tab, which is the lifetime this wants.
 *
 * WARN: Deliberately **not** "wake on any bfcache restore", which is what this
 * replaces. `src/shared/config/app.ts`'s `SSE_SYNC_COALESCE_WINDOW` records that
 * an iOS resume fires `pageshow` alongside `focus` and `visibilitychange`; if that
 * one carries `persisted`, waking on the event alone would dismiss the overlay on
 * every app-switch — the exact thing § 8.4.1. exists to prevent. Naming the one
 * departure we caused leaves that path untouched.
 */
const ZONE_DEPARTURE_KEY = "jandh_zone_departure";

/** Called immediately before the navigation that leaves for the zone. */
export function markZoneDeparture(): void {
  try {
    sessionStorage.setItem(ZONE_DEPARTURE_KEY, "1");
  } catch {
    // INFO: Storage can be refused outright (Safari in some privacy modes). The overlay is then merely as it was before this existed, which is survivable — a tap dismisses it.
  }
}

/**
 * Whether the return in progress is the one `markZoneDeparture` announced,
 * clearing the note either way.
 *
 * WARN: Read-and-clear, and every `pageshow` must call it — including the ones
 * that do nothing with the answer. A note left behind by a return that did not
 * come from the cache would otherwise sit there arming the next resume.
 */
export function takeZoneDeparture(): boolean {
  try {
    const marked = sessionStorage.getItem(ZONE_DEPARTURE_KEY) !== null;

    sessionStorage.removeItem(ZONE_DEPARTURE_KEY);

    return marked;
  } catch {
    return false;
  }
}
