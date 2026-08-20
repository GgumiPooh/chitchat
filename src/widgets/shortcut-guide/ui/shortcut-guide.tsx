"use client";

import { cn, isStandalone, safelyGet, safelyRun, useHydrated, useIsIos } from "@/shared/lib";
import { Button, IconButton } from "@/shared/ui";
import { Share, X } from "lucide-react";
import { useState } from "react";

const SHORTCUT_INSTALLED_KEY = "jandh:shortcut-installed";

export type ShortcutGuideProps = {
  shareKey: string;
  className?: string;
};

export function ShortcutGuide({ shareKey, className }: ShortcutGuideProps) {
  const isHydrated = useHydrated();
  const isIos = useIsIos();
  const [isDismissed, setIsDismissed] = useState(false);

  // PWA(설치된 독립 앱)인 경우에만 단축어 가이드를 띄움
  const isVisible =
    isHydrated &&
    isIos &&
    isStandalone() &&
    !isDismissed &&
    safelyGet(() => localStorage.getItem(SHORTCUT_INSTALLED_KEY)) !== "true";

  if (!isVisible) {
    return null;
  }

  const handleDismiss = () => {
    // 앱을 다시 켤 때는 다시 보이도록 React 상태만 변경 (localStorage 저장 안 함)
    setIsDismissed(true);
  };

  const handleConnect = () => {
    safelyRun(() => localStorage.setItem(SHORTCUT_INSTALLED_KEY, "true"));
    setIsDismissed(true);
    // 단축어 딥링크 실행 - 단축어 내부에서 이 키를 받아 저장함
    window.location.href = `shortcuts://run-shortcut?name=ChitChat&input=${shareKey}`;
  };

  return (
    <div className={cn("px-md pb-xs", className)}>
      <div className="pointer-events-auto">
        <div className="flex flex-col gap-xs rounded-lg border border-hairline glass p-sm shadow-floating">
          <div className="flex items-start gap-xs">
            <Share className="size-[18px] shrink-0 text-primary mt-[2px]" strokeWidth={1.75} />
            <div className="flex-1">
              <p className="text-body-sm text-body font-medium">
                다른 앱에서 바로 공유해보세요
              </p>
              <p className="text-body-xs text-meta mt-1">
                유튜브나 사파리에서 여기로 링크를 바로 보낼 수 있어요.
              </p>
            </div>
            <IconButton Icon={X} aria-label="안내 닫기" onClick={handleDismiss} />
          </div>
          <div className="flex gap-2xs mt-xs">
            <Button variant="secondary" className="flex-1" asChild>
              <a href="https://www.icloud.com/shortcuts/" target="_blank" rel="noopener">
                1. 단축어 다운로드
              </a>
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleConnect}>
              2. 계정 자동 연결
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
