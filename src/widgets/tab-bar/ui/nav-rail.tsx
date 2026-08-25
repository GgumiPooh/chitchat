"use client";

import { useChatStream } from "@/features/chat-stream";
import { useProfileViewer } from "@/features/view-profile";
import { APP_NAME, CALENDAR_ROUTE, CHAT_ROUTE, isUnderRoute } from "@/shared/config";
import { cn, usePendingTab, useRovingTabIndex, type UserId } from "@/shared/lib";
import { Avatar, Badge, IconButton, Link } from "@/shared/ui";
import { Plus } from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { TABS } from "../model/tabs";

export type NavRailProps = {
  className?: string;
  /** REQUIREMENTS.md § 11.5. Same dot `TabBar` shows on 캘린더 when something falls on today. */
  hasEventToday?: boolean;
  /** WARN: `ChatStreamValue` names no signed-in user (it is a conversation-wide stream); the bottom avatar needs one to pick itself out of `participants`, so the shell hands it down rather than the rail reaching for a hook that does not exist. */
  currentUserId: UserId;
};

/**
 * AGENTS.md § 4.1. The desktop replacement for `TabBar` at `md` — a left rail
 * instead of a bottom bar. Never dropped or inerted on `/chat`, unlike the bar it
 * replaces: the rail carries the 첨부 button and the profile avatar, both of
 * which a room still needs.
 */
export function NavRail({ className, hasEventToday = false, currentUserId }: NavRailProps) {
  const { unreadCount, participants, requestAttach } = useChatStream();
  const { openProfile } = useProfileViewer();
  const pathname = usePathname();
  const router = useRouter();
  const { pendingTab, setPendingTab } = usePendingTab(pathname);
  const handleKeyDown = useRovingTabIndex({
    orientation: "vertical",
    selector: "[data-rail-item]",
  });

  const activePath = pendingTab?.route ?? pathname;
  const activeIndex = TABS.findIndex(({ route }) => isUnderRoute(activePath, route));
  const currentUser = participants.find((participant) => participant.id === currentUserId);

  return (
    <nav
      className={cn(
        "fixed inset-y-0 left-0 z-30 flex w-(--rail-width) flex-col items-center gap-md border-r border-hairline bg-canvas py-md",
        className,
      )}
      aria-label="주요 화면"
    >
      <Link
        className="flex size-10 shrink-0 items-center justify-center rounded-full transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary"
        href={CHAT_ROUTE}
        aria-label={APP_NAME}
      >
        {/* INFO: `public/icons/icon.svg` — the same mark the manifest installs from. */}
        <Image
          className="size-10 rounded-full"
          src="/icons/icon.svg"
          alt=""
          width={40}
          height={40}
          unoptimized
        />
      </Link>

      {/* INFO: DESIGN.md § 7.3. The travelling fill, turned vertical for the rail. */}
      <ul className="relative flex flex-col items-stretch gap-2xs" onKeyDown={handleKeyDown}>
        {activeIndex >= 0 && (
          <span
            className="pointer-events-none absolute inset-x-0 top-0 rounded-full bg-primary-tint transition-[translate] duration-(--duration-tab-travel) ease-route motion-reduce:duration-0"
            aria-hidden="true"
            style={{
              height: `calc(100% / ${TABS.length})`,
              translate: `0 ${activeIndex * 100}%`,
            }}
          />
        )}
        {TABS.map(({ route, href, label, Icon }, index) => {
          const isActive = isUnderRoute(activePath, route);
          const stateClassName = cn(
            "transition-colors duration-(--duration-tab-travel) motion-reduce:duration-0",
            isActive ? "text-primary" : "text-meta hover:text-ink",
          );

          return (
            <li key={route} className="relative z-10">
              <Link
                className="group relative flex min-h-11 w-14 flex-col items-center justify-center gap-0.5 rounded-full outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                href={href}
                tabIndex={isActive || (activeIndex < 0 && index === 0) ? 0 : -1}
                haptic={!isActive}
                // WARN: Not a `ref` — `Link` wraps `next/link` with no `ref` in its props type, so roving tabindex reads the DOM through this attribute and `querySelectorAll` instead (§ 8.14.).
                data-rail-item=""
                aria-current={isActive ? "page" : undefined}
                onNavigate={() => setPendingTab(route)}
              >
                <span className="relative">
                  <Icon className={cn("size-5", stateClassName)} strokeWidth={1.75} />
                  {route === CHAT_ROUTE && unreadCount > 0 && (
                    <Badge className="absolute -top-1 -right-2">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </Badge>
                  )}
                  {route === CALENDAR_ROUTE && hasEventToday && (
                    <span className="absolute -top-0.5 -right-1 size-1.5 rounded-full bg-primary" />
                  )}
                </span>
                <span className={cn("text-tab-label", stateClassName)}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      {/* INFO: AGENTS.md § 4.4. `lg`-only — below it the panel does not exist to collapse. */}
      <IconButton
        className="mt-auto"
        Icon={Plus}
        variant="plain"
        haptic
        aria-label="첨부"
        onClick={handleAttach}
      />
      <Avatar
        size="row"
        name={currentUser?.name ?? ""}
        mediaId={currentUser?.avatarMediaId}
        onClick={() => openProfile(currentUserId)}
      />
    </nav>
  );

  function handleAttach() {
    requestAttach();

    if (!isUnderRoute(pathname, CHAT_ROUTE)) {
      router.push(CHAT_ROUTE);
    }
  }
}
