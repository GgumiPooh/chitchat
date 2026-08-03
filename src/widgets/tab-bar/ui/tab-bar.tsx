"use client";

import { CHAT_ROUTE } from "@/shared/config";
import { cn, useIsVirtualKeyboardOpen } from "@/shared/lib";
import { Badge } from "@/shared/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "../model/tabs";

export type TabBarProps = {
  className?: string;
  unreadCount?: number;
};

// INFO: DESIGN.md § 7.3. The glyphs stay outlined in both states — lucide ships no filled variant for these four.
export function TabBar({ className, unreadCount = 0 }: TabBarProps) {
  const pathname = usePathname();
  // INFO: DESIGN.md § 7.3. The shell shrinks to the visual viewport, so a bar left up would eat what little the keyboard leaves.
  const isKeyboardOpen = useIsVirtualKeyboardOpen();

  if (isKeyboardOpen) {
    return null;
  }

  return (
    <nav
      // INFO: DESIGN.md § 7.3. A floating pill, inset from the shell's bottom edge by `--bar-float-gap` on top of the home-indicator area.
      className={cn("px-md pb-[calc(env(safe-area-inset-bottom)+var(--bar-float-gap))]", className)}
      aria-label="주요 화면"
    >
      <div className="pointer-events-auto flex h-(--tab-bar-height) items-stretch rounded-full border border-hairline glass p-2xs shadow-floating">
        <ul className="flex flex-1 items-stretch">
          {TABS.map(({ href, label, Icon }) => {
            const isActive = pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
            const stateClassName = isActive ? "text-primary" : "text-meta group-hover:text-ink";

            return (
              <li key={href} className="flex-1">
                <Link
                  // INFO: DESIGN.md § 7.3. The active tab is the one place a filled surface appears, since the pill has no room for an indicator bar.
                  className={cn(
                    "group flex size-full min-h-11 flex-col items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset",
                    isActive ? "bg-primary-tint" : "hover:bg-surface-soft",
                  )}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                >
                  <span className="flex flex-col items-center gap-0.5 transition-transform group-active:scale-[0.96]">
                    <span className="relative">
                      <Icon className={cn("size-5", stateClassName)} strokeWidth={1.75} />
                      {href === CHAT_ROUTE && unreadCount > 0 && (
                        <Badge className="absolute -top-1 -right-2">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </Badge>
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
