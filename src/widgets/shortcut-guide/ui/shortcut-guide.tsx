"use client";

import { isStandalone, safelyGet, safelyRun, useHydrated, useIsIos } from "@/shared/lib";
import { BottomSheet, Button } from "@/shared/ui";
import { useState } from "react";

const SHORTCUT_INSTALLED_KEY = "jandh:shortcut-installed";

export type ShortcutGuideProps = {
  className?: string;
  shareKey: string;
};

export function ShortcutGuide({ className, shareKey }: ShortcutGuideProps) {
  const isHydrated = useHydrated();
  const isIos = useIsIos();
  const [isDismissed, setIsDismissed] = useState(false);

  // INFO: Mac 여부 판별
  const isMac = typeof window !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);
  const isTargetPlatform = isIos || isMac;

  // PWA(설치된 독립 앱)인 경우에만 단축어 바텀시트 가이드를 띄움
  const isVisible =
    isHydrated &&
    isTargetPlatform &&
    isStandalone() &&
    !isDismissed &&
    safelyGet(() => localStorage.getItem(SHORTCUT_INSTALLED_KEY)) !== "true";

  const handleDismiss = () => {
    // 앱을 다시 켤 때는 다시 보이도록 React 상태만 변경 (localStorage 저장 안 함)
    setIsDismissed(true);
  };

  const handleConnect = () => {
    safelyRun(() => localStorage.setItem(SHORTCUT_INSTALLED_KEY, "true"));
    setIsDismissed(true);
    // 단축어 딥링크 실행 - 단축어 내부에서 이 키를 받아 저장함
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent("ChitChat에 공유하기")}&input=${encodeURIComponent(`key: ${shareKey}`)}`;
  };

  return (
    <BottomSheet
      className={className}
      isOpen={isVisible}
      header={{
        title: "공유 단축어 연동",
        description: "인스타나 유튜브에서 ChitChat으로 공유할 수 있게돼요",
      }}
      onClose={handleDismiss}
    >
      <div className="flex flex-col gap-sm pt-xs">
        <div className="flex flex-col gap-xs rounded-lg border border-hairline bg-surface-soft p-sm">
          <p className="text-body-xs text-meta">
            1. 아래 [단축어 다운로드] 버튼을 눌러 애플 단축어를 설치하세요.
            <br />
            2. [계정 자동 연결] 버튼을 눌러 내 ChitChat 계정과 단축어를 연결하세요.
          </p>
        </div>
        <div className="flex flex-col gap-xs pt-xs">
          <Button className="w-full" asChild variant="secondary">
            <a
              rel="noopener"
              target="_blank"
              href={
                process.env.NEXT_PUBLIC_SHORTCUT_ICLOUD_URL || "https://www.icloud.com/shortcuts/"
              }
            >
              1. 단축어 다운로드
            </a>
          </Button>
          <Button className="w-full" variant="primary" onClick={handleConnect}>
            2. 계정 자동 연결
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
