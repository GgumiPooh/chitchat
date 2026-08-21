"use client";

import { safelyRun, useHydrated, useIsIos, useIsStandalone } from "@/shared/lib";
import { BottomSheet, Button, SettingsRow } from "@/shared/ui";
import { Share } from "lucide-react";
import { useState } from "react";

const SHORTCUT_INSTALLED_KEY = "jandh:shortcut-installed";

export type ShortcutSettingsRowProps = {
  className?: string;
  shareKey: string;
};

export function ShortcutSettingsRow({ className, shareKey }: ShortcutSettingsRowProps) {
  const isHydrated = useHydrated();
  const isIos = useIsIos();
  const isStandalone = useIsStandalone();
  const [isOpen, setIsOpen] = useState(false);

  // INFO: Mac 여부 판별 (User Agent가 Mac/Macintosh를 포함하는지 확인)
  const isMac = typeof window !== "undefined" && /Macintosh|Mac OS X/.test(navigator.userAgent);

  // INFO: (iOS이고 PWA) 이거나 (Mac이고 PWA) 인 경우에만 노출
  const isTargetEnvironment = isHydrated && isStandalone && (isIos || isMac);

  if (!isTargetEnvironment) {
    return null;
  }
  const handleConnect = () => {
    safelyRun(() => localStorage.setItem(SHORTCUT_INSTALLED_KEY, "true"));
    setIsOpen(false);
    window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent("ChitChat에 공유하기")}&input=${encodeURIComponent(`key: ${shareKey}`)}`;
  };

  return (
    <>
      <SettingsRow
        className={className}
        label="공유 단축어 설정"
        description="인스타나 유튜브에서 ChitChat으로 공유할 수 있게돼요"
        Icon={Share}
        haptic
        onClick={() => setIsOpen(true)}
      />
      <BottomSheet
        isOpen={isOpen}
        header={{
          title: "공유 단축어 연동",
          description: "인스타나 유튜브에서 ChitChat으로 공유할 수 있게돼요",
        }}
        onClose={() => setIsOpen(false)}
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
    </>
  );
}
