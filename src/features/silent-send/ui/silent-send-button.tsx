"use client";

import { cn } from "@/shared/lib";
import { ActionSheet, IconButton } from "@/shared/ui";
import { Bell, BellOff, Check } from "lucide-react";
import { useRef, useState } from "react";
import { useSilentSend } from "../model/use-silent-send";

export type SilentSendButtonProps = {
  className?: string;
};

/** REQUIREMENTS.md § 16.1. 조용히 보내기 — the chat header's toggle, beside the 다가오는 일정 button. */
export function SilentSendButton({ className }: SilentSendButtonProps) {
  const { isSilent, setIsSilent } = useSilentSend();
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={anchorRef} className={cn("inline-flex shrink-0", className)}>
      <IconButton
        iconClassName={cn(isSilent && "text-primary")}
        variant="floating"
        haptic
        Icon={isSilent ? BellOff : Bell}
        aria-label="알림 설정"
        aria-pressed={isSilent}
        aria-expanded={isOpen}
        onClick={() => setIsOpen(true)}
      />
      <ActionSheet
        isOpen={isOpen}
        anchorRef={anchorRef}
        header={{ title: "알림 설정" }}
        items={[
          {
            label: "조용히 보내기",
            Icon: isSilent ? Check : undefined,
            onSelect: () => setIsSilent(true),
          },
          {
            label: "알림 받게 하기",
            Icon: isSilent ? undefined : Check,
            onSelect: () => setIsSilent(false),
          },
        ]}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
