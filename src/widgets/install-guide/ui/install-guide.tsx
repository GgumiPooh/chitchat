"use client";

import type { Nullable } from "@/shared/lib";
import { cn, safelyGet, safelyRun, useHydrated } from "@/shared/lib";
import { IconButton } from "@/shared/ui";
import { Share, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { isIosBrowserTab } from "../model/is-ios-browser-tab";

const DISMISSED_KEY = "jandh:install-guide-dismissed";
const HEIGHT_PROPERTY = "--install-guide-height";

export type InstallGuideProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 7. Shown only in an iOS browser tab; once installed the check in `isIosBrowserTab` turns it off for good.
export function InstallGuide({ className }: InstallGuideProps) {
  // WARN: The decision needs `window`, so it has to wait for hydration — deriving it during render instead of in an effect keeps the banner out of the server HTML without a cascading re-render.
  const isHydrated = useHydrated();
  const [isDismissed, setIsDismissed] = useState(false);
  const bannerRef = useRef<Nullable<HTMLDivElement>>(null);

  // INFO: localStorage is fine for a dismissal flag — REQUIREMENTS.md § 5.2. bans it for auth state only, where ITP eviction would sign the user out.
  // WARN: Blocked storage makes every `localStorage` access throw, and this renders inside the `(main)` layout — an unguarded read takes down all four tabs.
  const isVisible =
    isHydrated &&
    !isDismissed &&
    safelyGet(() => localStorage.getItem(DISMISSED_KEY)) !== "true" &&
    isIosBrowserTab();

  // INFO: The banner is `fixed` above the tab bar, so the layout can only reserve room for it by reading its measured height back through `calc()` (DESIGN.md § 7.13.).
  useEffect(() => {
    const banner = bannerRef.current;

    if (!banner) {
      return;
    }

    // INFO: Observed rather than constant — the Korean copy wraps to two lines on a narrow viewport.
    const observer = new ResizeObserver(() =>
      document.documentElement.style.setProperty(HEIGHT_PROPERTY, `${banner.offsetHeight}px`),
    );

    observer.observe(banner);

    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty(HEIGHT_PROPERTY);
    };
  }, [isVisible]);

  if (!isVisible) {
    return null;
  }

  const dismiss = () => {
    safelyRun(() => localStorage.setItem(DISMISSED_KEY, "true"));
    setIsDismissed(true);
  };

  return (
    <div
      ref={bannerRef}
      className={cn(
        "fixed inset-x-0 bottom-[calc(var(--tab-bar-height)+env(safe-area-inset-bottom))] z-30",
        className,
      )}
    >
      <div className="mx-auto w-full max-w-(--container-app) px-md pb-xs">
        <div className="flex items-center gap-xs rounded-md border border-hairline bg-surface-soft py-xs pr-2xs pl-sm shadow-raised">
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
