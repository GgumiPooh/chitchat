"use client";

import { LOGIN_ROUTE } from "@/shared/config";
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

    const response = await fetch("/api/auth/logout", { method: "POST" });

    if (!response.ok) {
      setIsPending(false);
      toast.error("로그아웃하지 못했어요. 다시 시도해 주세요");

      return;
    }

    router.replace(LOGIN_ROUTE);
    router.refresh();
  };

  return (
    <Button className={className} variant="ghost" disabled={isPending} onClick={logOut}>
      로그아웃
    </Button>
  );
}
