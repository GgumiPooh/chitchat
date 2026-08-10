import { cn, type Maybe } from "@/shared/lib";

const ERROR_MESSAGE: Record<string, string> = {
  denied: "로그인을 취소했어요",
  failed: "로그인에 실패했어요. 다시 시도해 주세요",
  not_allowed: "허용된 계정이 아니에요",
  unverified: "이메일 인증이 완료된 구글 계정만 사용할 수 있어요",
};

export type LoginErrorProps = {
  className?: string;
  /** The route's own `searchParams` promise, awaited here rather than at the top of the page. */
  searchParams: Promise<{ error?: Maybe<string> }>;
};

/**
 * Why the last sign-in attempt came back, if it did.
 *
 * INFO: Its own component because `searchParams` is runtime data — awaiting it in
 * `LoginPage` would hold the whole screen out of the static shell for a line that is
 * absent on every visit that did not just fail.
 */
export async function LoginError({ className, searchParams }: LoginErrorProps) {
  const { error } = await searchParams;

  if (!error) {
    return null;
  }

  // WARN: `Object.hasOwn` and not an index read, exactly as `findHoliday` does — `?error=__proto__` would otherwise resolve to an inherited member and hand React an object to render, which throws on a URL anybody can type.
  const message = Object.hasOwn(ERROR_MESSAGE, error) ? ERROR_MESSAGE[error] : ERROR_MESSAGE.failed;

  return (
    <p className={cn("text-center text-body-sm text-semantic-error", className)} role="alert">
      {message}
    </p>
  );
}
