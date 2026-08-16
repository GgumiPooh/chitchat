"use client";

import type { DeviceSession } from "@/entities/session";
import { cn, formatDate, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { Button, Modal, SettingsRow, toast } from "@/shared/ui";
import { MonitorSmartphone } from "lucide-react";
import { useState } from "react";
import { revokeSession } from "../api/revoke-session";

export type DeviceListProps = {
  className?: string;
  sessions: DeviceSession[];
};

// INFO: REQUIREMENTS.md § 5.2. A sign-in that carried no `User-Agent` stores no label, and the row still has to name something.
const UNKNOWN_DEVICE = "알 수 없는 기기";

/**
 * REQUIREMENTS.md § 12. The logged-in devices, with per-session revocation. Reads
 * `sessions`, and revoking one also retires the § 16.1. push subscription registered
 * under it — the cascade does that, so this screen sends one request and no more.
 *
 * INFO: The caller's own session is marked rather than revocable. Signing the current
 * device out is the 로그아웃 row on the § 12. screen, which also clears the cookie —
 * revoking the row alone would leave one the proxy still waves through (§ 5.2.).
 */
export function DeviceList({ className, sessions }: DeviceListProps) {
  const [known, setKnown] = useState(sessions);
  const [pendingId, setPendingId] = useState<Nullable<string>>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  // INFO: § 5.2. revokes server-side, so the confirmation is stopped at its entry rather than opened onto a 로그아웃 that can only fail.
  const revokeGate = useOfflineGate(OFFLINE_MESSAGES.logOut);
  // INFO: Never empty — the session rendering this screen is one of the rows, which is also why there is no empty state.
  const pending = known.find((session) => session.id === pendingId) ?? null;

  return (
    <div className={cn("flex flex-col", className)}>
      {known.map((session) => (
        <SettingsRow
          key={session.id}
          label={session.label ?? UNKNOWN_DEVICE}
          // WARN: REQUIREMENTS.md § 5.2. An absolute date, because `last_seen_at` slides at most once a day — "3분 전" would claim a precision the column does not carry.
          description={`마지막 접속 ${formatDate(session.lastSeenAt)}`}
          Icon={MonitorSmartphone}
          trailing={
            session.isCurrent ? (
              <span className="shrink-0 text-caption text-meta">이 기기</span>
            ) : (
              <Button
                className="w-auto"
                buttonClassName="min-h-9 px-sm text-button-sm"
                variant="secondary"
                haptic
                {...revokeGate.blockedProps}
                onClick={revokeGate.guard(() => setPendingId(session.id))}
              >
                로그아웃
              </Button>
            )
          }
        />
      ))}
      <Modal
        isOpen={pending !== null}
        header={{
          title: "이 기기에서 로그아웃할까요?",
          description: `${pending?.label ?? UNKNOWN_DEVICE}의 알림이 꺼지고, 다시 로그인해야 해요`,
        }}
        onClose={() => setPendingId(null)}
      >
        {/* WARN: `flex-1` on both — `Button` is `w-full shrink-0`, so a bare pair in a row would push the second one off the modal. */}
        <div className="flex gap-xs">
          <Button className="flex-1" variant="secondary" onClick={() => setPendingId(null)}>
            취소
          </Button>
          <Button
            className="flex-1"
            variant="destructive"
            disabled={isRevoking}
            haptic
            onClick={() => void revoke()}
          >
            로그아웃
          </Button>
        </div>
      </Modal>
    </div>
  );

  async function revoke() {
    if (!pending) {
      return;
    }

    setIsRevoking(true);

    try {
      await revokeSession(pending.id);
      setKnown((current) => current.filter((session) => session.id !== pending.id));
      setPendingId(null);
    } catch {
      toast.error("로그아웃하지 못했어요");
    } finally {
      setIsRevoking(false);
    }
  }
}
