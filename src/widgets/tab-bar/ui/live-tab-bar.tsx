"use client";

import { useChatStream } from "@/features/chat-stream";
import { TabBar, type TabBarProps } from "./tab-bar";

export type LiveTabBarProps = Omit<TabBarProps, "unreadCount">;

/**
 * `TabBar` wired to the shell's stream (REQUIREMENTS.md § 8.8.), so the badge moves
 * while the user is standing on another tab rather than being resolved once per load.
 *
 * WARN: The split exists for the shell's `<Suspense>` fallback, which renders the
 * bare `TabBar`. That fallback is prerendered, where no session and therefore no
 * `ChatStreamProvider` exists — a bar that read the context directly could not be
 * drawn there at all, and the static shell would open on an empty canvas.
 */
export function LiveTabBar({ className, hasEventToday }: LiveTabBarProps) {
  const { unreadCount } = useChatStream();

  return <TabBar className={className} hasEventToday={hasEventToday} unreadCount={unreadCount} />;
}
