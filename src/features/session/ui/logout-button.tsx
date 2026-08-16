"use client";

import { request } from "@/shared/api";
import { LOGIN_ROUTE } from "@/shared/config";
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

  // WARN: Never offline-gated, and it is the one control in the app that may not be. `navigator.onLine` sticks `false` on a working network, and refusing 로그아웃 there locks somebody out of signing out of a device they are holding — a security consequence no other refusal here carries. It attempts always; the failure below is what a real outage gets.
  return (
    <Button className={className} variant="ghost" disabled={isPending} haptic onClick={logOut}>
      로그아웃
    </Button>
  );
}
