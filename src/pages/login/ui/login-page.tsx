import { DevLoginForm, GoogleLoginButton, SessionEndSync } from "@/features/session";
import { APP_NAME, IS_DEV_LOGIN_ENABLED } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Container } from "@/shared/ui";
import type { ReactNode } from "react";

export type LoginPageProps = {
  className?: string;
  /**
   * `LoginError`, wrapped in the route's own `<Suspense>`.
   *
   * WARN: A slot rather than the `?error=` code itself, and that is what keeps this
   * screen in the prerendered shell. Reading `searchParams` here would put the whole
   * login screen behind a boundary for the sake of one line that is absent on every
   * successful visit.
   */
  error?: ReactNode;
};

export function LoginPage({ className, error }: LoginPageProps) {
  return (
    // INFO: DESIGN.md § 3.3. The document is the scroller here too, so the column is in flow at `min-h-dvh` rather than a percentage of a body that no longer has a height.
    <main className={cn("flex min-h-dvh flex-col bg-canvas", className)}>
      {/* INFO: REQUIREMENTS.md § 16.2. Here because `proxy.ts` turns a browser that still holds a session away, so this screen renders only for a device whose session has ended — however it ended. */}
      <SessionEndSync />
      <Container className="flex flex-1 flex-col justify-between py-2xl" size="sm">
        <div className="flex flex-1 flex-col items-center justify-center gap-xs">
          <h1 className="text-display-lg text-ink">{APP_NAME}</h1>
          <p className="text-body-md text-meta">우리 둘만의 공간</p>
        </div>

        <div className="flex flex-col gap-sm">
          {error}
          <GoogleLoginButton />
          <p className="text-center text-caption text-meta-soft">
            초대된 계정만 로그인할 수 있어요
          </p>
          {IS_DEV_LOGIN_ENABLED && <DevLoginForm className="pt-md" />}
        </div>
      </Container>
    </main>
  );
}
