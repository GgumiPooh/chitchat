"use client";

import { CHAT_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Badge } from "@/shared/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TABS } from "../model/tabs";

export type TabBarProps = {
  className?: string;
  unreadCount?: number;
};

// INFO: DESIGN.md § 7.3. Colour alone carries the active state — lucide ships no filled variant for these four glyphs.
export function TabBar({ className, unreadCount = 0 }: TabBarProps) {
  const pathname = usePathname();

  return (
    <nav
      // WARN: `fixed` escapes the shell column, so DESIGN.md § 3.3. requires the inner element to re-apply the max width and centering.
      className={cn("fixed inset-x-0 bottom-0 z-40", className)}
      aria-label="주요 화면"
    >
      <div className="mx-auto w-full max-w-(--container-app) border-t border-hairline bg-canvas pb-[env(safe-area-inset-bottom)]">
        <ul className="flex h-(--tab-bar-height) items-stretch">
          {TABS.map(({ href, label, Icon }) => {
            const isActive = pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
            const stateClassName = isActive ? "text-primary" : "text-meta group-hover:text-ink";

            return (
              <li key={href} className="flex-1">
                <Link
                  className="group flex size-full min-h-11 flex-col items-center justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
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
