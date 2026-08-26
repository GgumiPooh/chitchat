"use client";

import { cn } from "@/shared/lib";
import { ActionSheet, IconButton } from "@/shared/ui";
import { Bell, BellOff, Check, Lock } from "lucide-react";
import { useRef, useState } from "react";
import { useSilentSend } from "../model/use-silent-send";

export type SilentSendButtonProps = {
  className?: string;
};

/** REQUIREMENTS.md § 16.1. 조용히 보내기 / 나에게만 보내기 — the chat header's toggle, beside the 다가오는 일정 button. */
export function SilentSendButton({ className }: SilentSendButtonProps) {
  const { mode, setMode } = useSilentSend();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const isOn = mode !== "notify";
  const HeaderIcon = mode === "onlyMe" ? Lock : isOn ? BellOff : Bell;

  return (
    <div ref={anchorRef} className={cn("inline-flex shrink-0", className)}>
      <IconButton
        iconClassName={cn(isOn && "text-primary")}
        variant="floating"
        haptic
        Icon={HeaderIcon}
        aria-label="알림 설정"
        aria-pressed={isOn}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      />
      <ActionSheet
        isOpen={isOpen}
        anchorRef={anchorRef}
        header={{ title: "알림 설정" }}
        items={[
          {
            label: "알림 받게 하기",
            Icon: mode === "notify" ? Check : undefined,
            onSelect: () => setMode("notify"),
          },
          {
            label: "조용히 보내기",
            Icon: mode === "silent" ? Check : undefined,
            onSelect: () => setMode("silent"),
          },
          {
            label: "나에게만 보내기",
            Icon: mode === "onlyMe" ? Check : undefined,
            onSelect: () => setMode("onlyMe"),
          },
        ]}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
