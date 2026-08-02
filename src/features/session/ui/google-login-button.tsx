import { Button } from "@/shared/ui";

export type GoogleLoginButtonProps = {
  className?: string;
};

// INFO: A plain link, not fetch — the OAuth handshake is a top-level redirect chain (REQUIREMENTS.md § 5.1.).
export function GoogleLoginButton({ className }: GoogleLoginButtonProps) {
  return (
    <Button className={className} variant="secondary" asChild>
      <a href="/api/auth/login/google">Google로 계속하기</a>
    </Button>
  );
}
