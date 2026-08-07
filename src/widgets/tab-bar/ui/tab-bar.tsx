"use client";

import { useChatStream } from "@/features/chat-stream";
import { CALENDAR_ROUTE, CHAT_ROUTE, isUnderRoute } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Badge, Link } from "@/shared/ui";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TABS } from "../model/tabs";

// WARN: The tab's **route** prefix, not its `href`. 보관함 links to its 사진 shelf while the bar fills from `/archive` (§ 10.), so a pending tab holding the link would never match `isUnderRoute` against itself.
type PendingTab = { route: string; from: Nullable<string> };

export type TabBarProps = {
  className?: string;
  /**
   * REQUIREMENTS.md § 11.5. A dot on 캘린더 when something falls on today.
   *
   * INFO: Resolved by the shell's server render rather than over the stream. It
   * changes at most once a day and on a write the user themselves made, and
   * `user_changed` (§ 8.4.) carries `users` rows — not events.
   */
  hasEventToday?: boolean;
};

// INFO: DESIGN.md § 7.3. The glyphs stay outlined in both states — lucide ships no filled variant for these four.
export function TabBar({ className, hasEventToday = false }: TabBarProps) {
  // INFO: REQUIREMENTS.md § 8.8. Live off the shell's stream rather than resolved once per page load — the badge has to move while the user is standing on another tab.
  const { unreadCount } = useChatStream();
  const pathname = usePathname();
  // INFO: DESIGN.md § 7.3. Every tab screen is dynamic, so the click is held for a server round trip; the fill moves on the tap instead of when the route commits.
  const [pendingTab, setPendingTab] = useState<Nullable<PendingTab>>(null);

  // WARN: Discarded during render, not merely masked. Left in state it would match again the next time the user lands back on `from` — a swipe-back would refill the tab they just left, `aria-current` and all.
  // INFO: React's documented "adjust state during render"; an effect is both a frame late and a cascading render the lint rules reject.
  if (pendingTab && pendingTab.from !== pathname) {
    setPendingTab(null);
  }

  const activePath = pendingTab?.route ?? pathname;
  const activeIndex = TABS.findIndex(({ route }) => isUnderRoute(activePath, route));

  // INFO: DESIGN.md § 7.3. Leaving for the keyboard is `BottomOverlay`'s job — unmounting here would step `--bottom-inset` on its own timeline and tear the composer's motion in two.
  return (
    <nav
      // INFO: DESIGN.md § 7.3. A floating pill, inset from the shell's bottom edge by `--bar-float-gap` on top of the home-indicator area.
      className={cn("px-md pb-[calc(env(safe-area-inset-bottom)+var(--bar-float-gap))]", className)}
      aria-label="주요 화면"
    >
      <div className="pointer-events-auto flex h-(--tab-bar-height) items-stretch rounded-full border border-hairline glass p-2xs shadow-floating">
        {/* INFO: DESIGN.md § 7.3. The fill's own track, so it measures against the padded row of items rather than the pill's border box. */}
        <div className="relative flex flex-1 items-stretch">
          {activeIndex >= 0 && (
            // INFO: DESIGN.md § 7.3. One fill for the whole bar rather than one per tab, so a switch travels it across instead of lighting a second one.
            // WARN: DESIGN.md § 7.3. A percentage of the fill's own box, so the travel needs no measurement — the columns are `flex-1` and have no pixel geometry to read until layout.
            <span
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-primary-tint transition-[translate] duration-(--duration-tab-travel) ease-route motion-reduce:duration-0"
              aria-hidden="true"
              style={{
                width: `calc(100% / ${TABS.length})`,
                translate: `${activeIndex * 100}% 0`,
              }}
            />
          )}
          {/* WARN: DESIGN.md § 7.3. The list is lifted over the fill explicitly, never by DOM order. `Link` makes an anchor `relative` only when `haptic` is on, and `haptic` is off on the active tab — the one tab the fill is parked under is therefore the one non-positioned anchor, and its `focus-visible` ring would paint beneath an opaque `primary-tint`. */}
          <ul className="relative z-10 flex flex-1 items-stretch">
            {TABS.map(({ route, href, label, Icon }) => {
              const isActive = isUnderRoute(activePath, route);
              // INFO: DESIGN.md § 7.3. Crossed over the fill's own duration rather than swapped, so the pair lands with the fill instead of turning `primary` while it is still travelling.
              // WARN: `--duration-tab-travel`, and it MUST track whatever the fill above uses. Left on `--duration-state` the label lands before the fill is halfway across and sits `primary` on bare glass waiting for it — the exact snap this crossfade exists to prevent, and it widens every time the travel is slowed.
              // WARN: `motion-reduce:duration-0` has to track the fill's too, or the desync this crossfade prevents comes back inverted under reduced motion — the fill snapping instantly while the glyph and label take the full travel. DESIGN.md § 7.3.'s contract is that the travel drops to 0s for both.
              const stateClassName = cn(
                "transition-colors duration-(--duration-tab-travel) motion-reduce:duration-0",
                isActive ? "text-primary" : "text-meta group-hover:text-ink",
              );

              return (
                <li key={route} className="flex-1">
                  <Link
                    // INFO: DESIGN.md § 3.2. On top of the callout suppression `Link` already carries: the labels are chrome, so a hold that finds no preview must not raise the selection magnifier over 채팅 instead.
                    className={cn(
                      "group flex size-full min-h-11 flex-col items-center justify-center rounded-full transition-colors duration-(--duration-state) outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                      !isActive && "hover:bg-surface-soft",
                    )}
                    href={href}
                    // INFO: Only off the tab the user is standing on — re-tapping the current tab switches nothing, so it has nothing to confirm.
                    haptic={!isActive}
                    aria-current={isActive ? "page" : undefined}
                    // INFO: `onNavigate` and not `onClick` — a ⌘-click opens a tab in a new window and switches nothing here, and Next skips this handler for exactly those.
                    onNavigate={() => setPendingTab({ route, from: pathname })}
                  >
                    {/* WARN: DESIGN.md § 4.7.2. The bloom is on the glyph stack and not the anchor. The anchor is a quarter of the pill wide, so at this dial its hover fill and focus ring would swell a third of a column past the pill and over the tabs beside it — and the fill it used to spring with now travels behind the items (§ 7.3.) rather than riding it. */}
                    {/* WARN: DESIGN.md § 4.7.2. It is reached through the anchor's `.group`, which is the descendant form of `[data-pressed]` — the only one that fires under a finger, since `HapticTap` marks the anchor and not this span. */}
                    <span className="flex press-bloom flex-col items-center gap-0.5 [--press-scale:1.25]">
                      <span className="relative">
                        <Icon className={cn("size-5", stateClassName)} strokeWidth={1.75} />
                        {route === CHAT_ROUTE && unreadCount > 0 && (
                          <Badge className="absolute -top-1 -right-2">
                            {unreadCount > 99 ? "99+" : unreadCount}
                          </Badge>
                        )}
                        {/* INFO: REQUIREMENTS.md § 11.5. A single dot, never a count — the calendar's news is that there is something today, not how much. */}
                        {route === CALENDAR_ROUTE && hasEventToday && (
                          <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-primary" />
                        )}
                      </span>
                      <span className={cn("text-tab-label", stateClassName)}>{label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
