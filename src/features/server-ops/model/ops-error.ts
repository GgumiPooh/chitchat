import { DormantRequestError } from "@/shared/api";

/** REQUIREMENTS.md § 12.4. A non-2xx from this app's `/api/ops/` routes, carrying the status the screen branches on. */
export class OpsRequestError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number) {
    super(`${method} ${path} responded ${status}`);
    this.name = "OpsRequestError";
    this.status = status;
  }
}

/**
 * The sentence the result modal shows when a run could not be ASKED for.
 *
 * INFO: These are all failures of the request, never of the run. A dispatch that GitHub
 * accepted is reported by the run's own push, which now goes to whoever pressed the button
 * (§ 12.4.) rather than to one fixed account.
 */
export function describeOpsFailure(error: unknown): string {
  if (error instanceof DormantRequestError) {
    return "절전 모드예요. 화면을 한 번 누른 뒤 다시 시도해 주세요";
  }

  if (!(error instanceof OpsRequestError)) {
    return "요청을 보내지 못했어요";
  }

  switch (error.status) {
    case 401:
      return "로그인이 만료됐어요. 다시 로그인해 주세요";
    // INFO: § 12.4. Either no dispatch token is set, or the one that is cannot write to Actions — a deployment problem rather than a run that failed, and one no retry can fix.
    case 503:
      return "실행을 요청할 수 없는 상태예요. 설정을 확인해 주세요";
    default:
      return "잠시 후 다시 시도해 주세요";
  }
}
