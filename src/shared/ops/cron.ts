import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * REQUIREMENTS.md § 16.3. Whether an outside clock may call this deployment's cron routes.
 *
 * INFO: Optional on the same terms as `OPS_GITHUB_TOKEN` — unset, the route answers `unavailable` and the GitHub Actions schedule is the only clock.
 */
export function isOpsCronConfigured(): boolean {
  return Boolean(process.env.OPS_CRON_TOKEN?.trim());
}

/**
 * Whether `request` carries `Authorization: Bearer <OPS_CRON_TOKEN>`.
 *
 * INFO: Both sides are hashed before `timingSafeEqual`, which throws on unequal lengths — a length mismatch would otherwise answer faster than a wrong token of the right length.
 */
export function isOpsCronRequest(request: Request): boolean {
  const expected = process.env.OPS_CRON_TOKEN?.trim();
  const presented = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "")
    .trim();

  if (!expected || !presented) {
    return false;
  }

  return timingSafeEqual(digest(expected), digest(presented));
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}
