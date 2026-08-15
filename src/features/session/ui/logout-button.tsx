"use client";

import { request } from "@/shared/api";
import { LOGIN_ROUTE } from "@/shared/config";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { clearAll } from "@/shared/snapshot";
import { Button, toast } from "@/shared/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  // WARN: § 5.2. revokes the session server-side, so an offline 로그아웃 leaves the cookie live and the snapshots cleared — the reader is signed in with nothing cached to read.
  const { isBlocked, blockedProps, guard } = useOfflineGate(OFFLINE_MESSAGES.logOut);

  const logOut = async () => {
    setIsPending(true);

    // INFO: A rejected fetch is the offline PWA case, which is the target environment — an unhandled one would strand the button disabled.
    const isLoggedOut = await request("/api/auth/logout", { method: "POST" })
      .then((response) => response.ok)
      .catch(() => false);

    if (!isLoggedOut) {
      setIsPending(false);
      toast.error("로그아웃하지 못했어요. 다시 시도해 주세요");

      return;
    }

    // INFO: REQUIREMENTS.md § 16. The cookie is what the server just cleared; the offline snapshots are the half only this browser can.
    await clearAll();

    router.replace(LOGIN_ROUTE);
    router.refresh();
  };

  return (
    <Button
      className={className}
      variant="ghost"
      disabled={isPending}
      haptic={!isBlocked}
      {...blockedProps}
      onClick={guard(() => void logOut())}
    >
      로그아웃
    </Button>
  );
}
