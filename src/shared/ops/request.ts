import "server-only";

import { ensureEnv } from "@/shared/config";

/**
 * REQUIREMENTS.md § 12.4. Which of jandh-ops' two secrets a call presents.
 *
 * WARN: `cleanup` for everything destructive — deleting a backup as much as the orphan
 * sweep. That repository refuses to boot with the two set equal, on the argument that
 * `BACKUP_TOKEN` is the widely-copied one (a Worker secret, its `.env`, shell history)
 * and must not also be a delete credential. Reusing it here would undo that.
 */
export type OpsCredential = "backup" | "cleanup";

const TOKEN_ENV: Record<OpsCredential, string> = {
  backup: "BACKUP_TOKEN",
  cleanup: "CLEANUP_TOKEN",
};

/**
 * REQUIREMENTS.md § 12.4. Whether this deployment has a jandh-ops to call.
 *
 * WARN: No default address any more, and that is what the 서버 관리 screen toggles its
 * ops-only controls on. A default made the variable unfalsifiable — every deployment
 * "had" an ops service, so the screen could only offer 백업 생성 and the sweep and let
 * them fail. The list and the per-backup deletion do not consult this: they read R2
 * directly and outlive that service.
 */
export function isOpsConfigured(): boolean {
  return Boolean(process.env.OPS_API_URL?.trim());
}

export type OpsResponse = {
  isOk: boolean;
  status: number;
  payload: unknown;
};

/**
 * Calls jandh-ops and hands back its status and JSON.
 *
 * INFO: The token never leaves the server — the whole reason 서버 관리 talks to its own
 * Route Handlers rather than to jandh-ops directly (REQUIREMENTS.md § 12.4.).
 *
 * WARN: No timeout of its own. A dump of a growing database and a sweep of the whole
 * bucket both run for minutes, and cutting the request short would report a failure for
 * work that is still finishing — jandh-ops pushes the real verdict when it lands.
 */
export async function callOps(
  path: string,
  { method, credential, body }: { method: string; credential: OpsCredential; body?: unknown },
): Promise<OpsResponse> {
  const baseUrl = ensureEnv("OPS_API_URL").replace(/\/$/, "");

  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${ensureEnv(TOKEN_ENV[credential])}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });

  return {
    isOk: response.ok,
    status: response.status,
    payload: await response.json().catch(() => null),
  };
}
