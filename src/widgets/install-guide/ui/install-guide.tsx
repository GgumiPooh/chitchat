"use client";

import { cn, safelyGet, safelyRun, useHydrated, useIsVirtualKeyboardOpen } from "@/shared/lib";
import { IconButton } from "@/shared/ui";
import { Share, X } from "lucide-react";
import { useState } from "react";
import { isIosBrowserTab } from "../model/is-ios-browser-tab";

const DISMISSED_KEY = "jandh:install-guide-dismissed";

export type InstallGuideProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 7. Shown only in an iOS browser tab; once installed the check in `isIosBrowserTab` turns it off for good.
export function InstallGuide({ className }: InstallGuideProps) {
  // WARN: The decision needs `window`, so it has to wait for hydration — deriving it during render instead of in an effect keeps the banner out of the server HTML without a cascading re-render.
  const isHydrated = useHydrated();
  // INFO: The shell shrinks to the visual viewport, so every row it holds competes with the composer for what the keyboard leaves (DESIGN.md § 3.4.).
  const isKeyboardOpen = useIsVirtualKeyboardOpen();
  const [isDismissed, setIsDismissed] = useState(false);

  // INFO: localStorage is fine for a dismissal flag — REQUIREMENTS.md § 5.2. bans it for auth state only, where ITP eviction would sign the user out.
  // WARN: Blocked storage makes every `localStorage` access throw, and this renders inside the `(main)` layout — an unguarded read takes down all four tabs.
  const isVisible =
    isHydrated &&
    !isKeyboardOpen &&
    !isDismissed &&
    safelyGet(() => localStorage.getItem(DISMISSED_KEY)) !== "true" &&
    isIosBrowserTab();

  if (!isVisible) {
    return null;
  }

  const dismiss = () => {
    safelyRun(() => localStorage.setItem(DISMISSED_KEY, "true"));
    setIsDismissed(true);
  };

  return (
    // INFO: DESIGN.md § 3.5. Inside `BottomOverlay`, directly above the floating tab bar.
    <div className={cn("px-md pb-xs", className)}>
      <div className="pointer-events-auto">
        <div className="flex items-center gap-xs rounded-lg border border-hairline glass py-xs pr-2xs pl-sm shadow-floating">
          <Share className="size-[18px] shrink-0 text-meta" strokeWidth={1.75} />
          <p className="flex-1 text-body-sm text-body">
            공유 버튼을 눌러 &lsquo;홈 화면에 추가&rsquo;를 선택하면 앱처럼 열려요
          </p>
          <IconButton Icon={X} aria-label="안내 닫기" onClick={dismiss} />
        </div>
      </div>
    </div>
  );
}
