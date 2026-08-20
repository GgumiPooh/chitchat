"use client";

import { safelyGet, safelyRun, useHydrated } from "@/shared/lib";
import { BottomSheet, Button } from "@/shared/ui";
import { PlusSquare, Share } from "lucide-react";
import { useState } from "react";

const DISMISSED_KEY = "jandh:install-guide-dismissed";

export type InstallGuideProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 7. Shown only in an iOS browser tab; once installed the check in `isIosBrowserTab` turns it off for good.
export function InstallGuide({ className }: InstallGuideProps) {
  // WARN: The decision needs `window`, so it has to wait for hydration — deriving it during render instead of in an effect keeps the banner out of the server HTML without a cascading re-render.
  const isHydrated = useHydrated();
  const [isDismissed, setIsDismissed] = useState(false);

  // INFO: localStorage is fine for a dismissal flag — REQUIREMENTS.md § 5.2. bans it for auth state only, where ITP eviction would sign the user out.
  // WARN: Blocked storage makes every `localStorage` access throw, and this renders inside the `(main)` layout — an unguarded read takes down all four tabs.
  // INFO: Mac/iOS 등 일반 브라우저 탭(미설치 상태)에서 가이드를 띄움
  const isTargetTab =
    typeof window !== "undefined" && !window.matchMedia("(display-mode: standalone)").matches;

  const isVisible =
    isHydrated &&
    !isDismissed &&
    safelyGet(() => localStorage.getItem(DISMISSED_KEY)) !== "true" &&
    isTargetTab;

  const dismiss = () => {
    safelyRun(() => localStorage.setItem(DISMISSED_KEY, "true"));
    setIsDismissed(true);
  };

  return (
    <BottomSheet
      className={className}
      isOpen={isVisible}
      header={{
        title: "홈 화면에 앱 추가하기",
        description: "사파리에서 홈 화면에 추가하면 전체 화면 앱으로 편리하게 사용할 수 있어요.",
      }}
      onClose={dismiss}
    >
      <div className="flex flex-col gap-sm pt-xs">
        <div className="flex flex-col gap-xs rounded-lg border border-hairline bg-surface-soft p-sm">
          <div className="flex items-start gap-xs text-body-sm text-body">
            <span className="text-body-xs flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-strong font-semibold text-meta">
              1
            </span>
            <div className="flex-1 leading-relaxed">
              사파리 하단 메뉴바의 <Share className="inline size-4 align-[-2px] text-primary" />{" "}
              <strong>공유 버튼</strong>을 누르세요.
            </div>
          </div>
          <div className="flex items-start gap-xs text-body-sm text-body">
            <span className="text-body-xs flex size-5 shrink-0 items-center justify-center rounded-full bg-surface-strong font-semibold text-meta">
              2
            </span>
            <div className="flex-1 leading-relaxed">
              메뉴에서 <PlusSquare className="inline size-4 align-[-2px] text-primary" />{" "}
              <strong>&lsquo;홈 화면에 추가&rsquo;</strong>를 선택하세요.
            </div>
          </div>
        </div>
        <div className="pt-xs">
          <Button className="w-full" variant="primary" onClick={dismiss}>
            확인했습니다
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
