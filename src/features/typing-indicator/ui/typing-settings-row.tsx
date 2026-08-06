"use client";

import { updateProfile } from "@/features/update-profile/@x/typing-indicator";
import { SettingsRow, Switch, toast } from "@/shared/ui";
import { PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type TypingSettingsRowProps = {
  className?: string;
  isEnabled: boolean;
};

/**
 * REQUIREMENTS.md § 12. Turns off this user's own 입력 중 broadcast (§ 8.12.).
 *
 * INFO: It is not reciprocal — turning it off stops what this device sends and
 * changes nothing about what it receives. Read receipts trade that way in other
 * apps; here there is no accounting to keep between two people.
 */
export function TypingSettingsRow({ className, isEnabled }: TypingSettingsRowProps) {
  // INFO: Seeded from the Server Component's row and moved optimistically, so the switch answers the tap rather than the round trip.
  const [isChecked, setIsChecked] = useState(isEnabled);
  const [isBusy, setIsBusy] = useState(false);
  const router = useRouter();

  return (
    <SettingsRow
      className={className}
      description="내가 메시지를 쓰는 동안 상대방에게 표시돼요"
      Icon={PenLine}
      label="입력 중 표시"
      trailing={
        <Switch
          checked={isChecked}
          disabled={isBusy}
          haptic
          aria-label="입력 중 표시 보내기"
          onCheckedChange={(next) => void toggle(next)}
        />
      }
    />
  );

  async function toggle(next: boolean) {
    setIsChecked(next);
    setIsBusy(true);

    try {
      await updateProfile({ typingIndicatorEnabled: next });
      // INFO: The chat screen reads this preference from its own server render (§ 8.12.), so the saved row has to reach it the way § 12.'s profile save does.
      router.refresh();
    } catch {
      // WARN: Put back on failure. Left where the tap moved it, the switch would report a preference the server never took — and the § 8.12. ping would keep going out behind a control reading 꺼짐.
      setIsChecked(!next);
      toast.error("설정을 저장하지 못했어요");
    } finally {
      setIsBusy(false);
    }
  }
}
