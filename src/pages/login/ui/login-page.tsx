import { GoogleLoginButton } from "@/features/session";
import { APP_NAME } from "@/shared/config";
import { cn, type Maybe } from "@/shared/lib";
import { Container } from "@/shared/ui";

export type LoginPageProps = {
  className?: string;
  error?: Maybe<string>;
};

const ERROR_MESSAGE: Record<string, string> = {
  denied: "로그인을 취소했어요",
  failed: "로그인에 실패했어요. 다시 시도해 주세요",
  not_allowed: "허용된 계정이 아니에요",
  unverified: "이메일 인증이 완료된 구글 계정만 사용할 수 있어요",
};

export function LoginPage({ className, error }: LoginPageProps) {
  const message = error ? (ERROR_MESSAGE[error] ?? ERROR_MESSAGE.failed) : null;

  return (
    // INFO: DESIGN.md § 3.4. The document cannot scroll, so this screen owns its own scroller the way the `(main)` shell does.
    <main className={cn("h-full overflow-y-auto bg-canvas", className)}>
      <Container className="flex min-h-full flex-col justify-between py-2xl" size="sm">
        <div className="flex flex-1 flex-col items-center justify-center gap-xs">
          <h1 className="text-display-lg text-ink">{APP_NAME}</h1>
          <p className="text-body-md text-meta">우리 둘만의 공간</p>
        </div>

        <div className="flex flex-col gap-sm">
          {message && (
            <p className="text-center text-body-sm text-semantic-error" role="alert">
              {message}
            </p>
          )}
          <GoogleLoginButton />
          <p className="text-center text-caption text-meta-soft">
            초대된 계정만 로그인할 수 있어요
          </p>
        </div>
      </Container>
    </main>
  );
}
