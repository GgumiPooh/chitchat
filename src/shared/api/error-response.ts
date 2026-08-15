import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 14. Every error a Route Handler may answer with, and the status
 * that goes with it. The code is the whole body — no message, no cause, no field.
 *
 * WARN: Adding a case here is how a new error is introduced; never inline a
 * `NextResponse.json({ error })` beside one. A message assembled at the call site is
 * where a driver string, a storage key or a filesystem path gets out, and Next's own
 * Route Handler guide reaches for `reason.message` at exactly that spot.
 */
const ERROR_STATUS = {
  invalid_request: 400,
  unauthorized: 401,
  not_found: 404,
  conflict: 409,
  /** REQUIREMENTS.md § 13.6. A 409 that names its reason: the emoticon has been sent and cannot be deleted. */
  in_use: 409,
  too_large: 413,
  unsupported_media: 415,
  unprocessable: 422,
  /** REQUIREMENTS.md § 12.4. jandh-ops answered, and the answer was a failure. Its own push carries the reason; this side never repeats it. */
  upstream_failed: 502,
  /** REQUIREMENTS.md § 12.4. jandh-ops is unreachable or its address and tokens are not configured here. */
  unavailable: 503,
  /** REQUIREMENTS.md § 12.4. The connection to jandh-ops was cut while the run continued there — NOT a verdict on the run, which reports itself by push. */
  upstream_timeout: 504,
} as const;

export type ApiErrorCode = keyof typeof ERROR_STATUS;

/**
 * REQUIREMENTS.md § 14. The one error response shape. Clients branch on the status;
 * the code is for the log and for reading the handler.
 */
export function apiError(code: ApiErrorCode): NextResponse {
  return NextResponse.json({ error: code }, { status: ERROR_STATUS[code] });
}
