import "server-only";

import { apiError } from "@/shared/api";
import { NextResponse } from "next/server";
import { callOps, type OpsCredential } from "./request";

/**
 * REQUIREMENTS.md § 12.4. Forwards one ops call and answers with jandh-ops' own JSON —
 * the 서버 관리 screen shows that body verbatim, which is the point of the screen.
 *
 * WARN: A failure is answered with an `apiError` code and nothing else (§ 14.). The
 * upstream message is an `aws` stderr line carrying bucket paths and key ids, and the
 * user already gets the readable reason as a push from jandh-ops itself.
 */
export async function answerOps(
  path: string,
  options: { method: string; credential: OpsCredential; body?: unknown },
): Promise<NextResponse> {
  try {
    const { isOk, status, payload } = await callOps(path, options);

    if (isOk) {
      return NextResponse.json(payload);
    }

    console.error(`[ops] ${options.method} ${path} responded ${status}`);

    if (status === 404) {
      return apiError("not_found");
    }

    // INFO: A rejected token is a misconfiguration of this deployment rather than a failed run, so it answers as "cannot ask" and the screen says so instead of promising a push.
    return apiError(
      status === 401 || status === 403 || status === 503 ? "unavailable" : "upstream_failed",
    );
  } catch (error) {
    console.error("[ops] request failed", error);

    // WARN: A cut connection is NOT a verdict on the run. `pg_dump | aws s3 cp` outlives undici's 300s header timeout on a large database, and the dump keeps streaming after this throws — jandh-ops pushes the result when it lands, so the screen has to say "still going" rather than "failed".
    return apiError(isTimeout(error) ? "upstream_timeout" : "unavailable");
  }
}

const TIMEOUT_CAUSES = new Set(["UND_ERR_HEADERS_TIMEOUT", "UND_ERR_BODY_TIMEOUT"]);

// INFO: undici reports a timeout as a `TypeError` whose `cause` carries the code; a connect timeout is deliberately absent, since nothing was ever running to keep running.
function isTimeout(error: unknown): boolean {
  const cause = error instanceof Error ? error.cause : null;

  return cause instanceof Error && "code" in cause && TIMEOUT_CAUSES.has(String(cause.code));
}
