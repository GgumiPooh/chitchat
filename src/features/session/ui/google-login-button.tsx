"use client";

import { Button } from "@/shared/ui";

export type GoogleLoginButtonProps = {
  className?: string;
};

// INFO: Replace location on navigation so `/login` does not remain in history (REQUIREMENTS.md § 5.1.).
export function GoogleLoginButton({ className }: GoogleLoginButtonProps) {
  return (
    <Button
      className={className}
      variant="secondary"
      onClick={() => {
        window.location.replace("/api/auth/login/google");
      }}
    >
      Google로 계속하기
    </Button>
  );
}
