import { DormantRequestError } from "@/shared/api";

/** REQUIREMENTS.md § 12.4. A non-2xx from this app's `/api/ops/` proxy, carrying the status the screen branches on. */
export class OpsRequestError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number) {
    super(`${method} ${path} responded ${status}`);
    this.name = "OpsRequestError";
    this.status = status;
  }
}

/**
 * The sentence the result modal shows under a failed run.
 *
 * WARN: `fallback` is the only branch that may promise a push, and it is reached only by
 * `upstream_failed` — jandh-ops answered, so jandh-ops is sending one. Every other status
 * is a run that never started, and telling that reader to wait for a notification would
 * leave them waiting for one nothing will send.
 */
export function describeOpsFailure(error: unknown, fallback: string): string {
  if (error instanceof DormantRequestError) {
    return "절전 모드예요. 화면을 한 번 누른 뒤 다시 시도해 주세요";
  }

  if (!(error instanceof OpsRequestError)) {
    return "요청을 보내지 못했어요";
  }

  switch (error.status) {
    case 401:
      return "로그인이 만료됐어요. 다시 로그인해 주세요";
    case 503:
      return "서버에 연결하지 못했어요";
    // INFO: § 14.'s `upstream_timeout` — the connection was cut while jandh-ops kept working, so this is the one failure that is not one.
    case 504:
      return "응답이 오래 걸려 결과를 받지 못했어요. 끝나면 푸시 알림으로 알려드려요";
    default:
      return fallback;
  }
}
