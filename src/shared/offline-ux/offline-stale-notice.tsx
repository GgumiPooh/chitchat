"use client";

import { cn, useIsOffline } from "@/shared/lib";
import { CloudOff } from "lucide-react";

const STALE_TEXT = "인터넷에 연결되어 있지 않아요. 지금 보이는 건 마지막으로 받아둔 내용이에요";

export type OfflineStaleNoticeProps = {
  className?: string;
};

/**
 * What a screen this deployment cannot reach offline says once the network goes
 * out from under it.
 *
 * WARN: For the screens no mirror covers — 기기 관리, 이모티콘 관리, 서버 관리. A reader only ever sees it by having been standing on one when the connection dropped, which is exactly why the screen is left where it is rather than navigated away from.
 * INFO: A strip rather than a toast, because the state persists and a toast would leave before the thing it describes does.
 */
export function OfflineStaleNotice({ className }: OfflineStaleNoticeProps) {
  const isOffline = useIsOffline();

  if (!isOffline) {
    return null;
  }

  return (
    <p
      className={cn(
        "flex items-center gap-xs border-b border-hairline-soft bg-surface-soft px-md py-sm text-body-sm text-meta",
        className,
      )}
      role="status"
    >
      <CloudOff className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
      {STALE_TEXT}
    </p>
  );
}
