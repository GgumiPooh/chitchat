"use client";

import { useChatStream } from "@/features/chat-stream";
import { CALENDAR_ROUTE, CHAT_ROUTE, isUnderRoute } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Badge, Link } from "@/shared/ui";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TABS } from "../model/tabs";

type PendingTab = { href: string; from: Nullable<string> };

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

  const activeHref = pendingTab?.href ?? pathname;

  // INFO: DESIGN.md § 7.3. Leaving for the keyboard is `BottomOverlay`'s job — unmounting here would step `--bottom-inset` on its own timeline and tear the composer's motion in two.
  return (
    <nav
      // INFO: DESIGN.md § 7.3. A floating pill, inset from the shell's bottom edge by `--bar-float-gap` on top of the home-indicator area.
      className={cn("px-md pb-[calc(env(safe-area-inset-bottom)+var(--bar-float-gap))]", className)}
      aria-label="주요 화면"
    >
      <div className="pointer-events-auto flex h-(--tab-bar-height) items-stretch rounded-full border border-hairline glass p-2xs shadow-floating">
        <ul className="flex flex-1 items-stretch">
          {TABS.map(({ href, label, Icon }) => {
            const isActive = isUnderRoute(activeHref, href);
            const stateClassName = isActive ? "text-primary" : "text-meta group-hover:text-ink";

            return (
              <li key={href} className="flex-1">
                <Link
                  // INFO: DESIGN.md § 7.3. The active tab is the one place a filled surface appears, since the pill has no room for an indicator bar.
                  // WARN: DESIGN.md § 4.7.2. The bloom goes here and not on the glyph stack inside, so the active tab's fill springs with its contents instead of holding still while they bounce out of it. `press-bloom` owns the whole `transition` shorthand — the colour transition it replaced MUST NOT come back as `transition-colors`, which would silently drop one of the two.
                  // WARN: DESIGN.md § 4.7.2. The 1.3 default is sized for a 44px circle; this anchor is the full width of a quarter of the pill, so it takes the documented `--press-scale` dial instead. Left at the default it swells ~13px past the pill's `2xs` padding and over the tabs beside it.
                  className={cn(
                    "group flex size-full min-h-11 press-bloom flex-col items-center justify-center rounded-full outline-none [--press-scale:1.08] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                    // WARN: DESIGN.md § 7.3. The zero duration rides on the active branch, not the base class, so it applies only while the fill is arriving. Removed with the branch, the fill still leaves over `--duration-state` — the tab the user left fades out while the one they tapped is already lit under the finger.
                    isActive
                      ? "bg-primary-tint [--press-fill-duration:0s]"
                      : "hover:bg-surface-soft",
                  )}
                  href={href}
                  // INFO: Only off the tab the user is standing on — re-tapping the current tab switches nothing, so it has nothing to confirm.
                  haptic={!isActive}
                  aria-current={isActive ? "page" : undefined}
                  // INFO: `onNavigate` and not `onClick` — a ⌘-click opens a tab in a new window and switches nothing here, and Next skips this handler for exactly those.
                  onNavigate={() => setPendingTab({ href, from: pathname })}
                >
                  <span className="flex flex-col items-center gap-0.5">
                    <span className="relative">
                      <Icon className={cn("size-5", stateClassName)} strokeWidth={1.75} />
                      {href === CHAT_ROUTE && unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-2">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
                      )}
                      {/* INFO: REQUIREMENTS.md § 11.5. A single dot, never a count — the calendar's news is that there is something today, not how much. */}
                      {href === CALENDAR_ROUTE && hasEventToday && (
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
    </nav>
  );
}
