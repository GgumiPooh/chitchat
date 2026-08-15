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

// INFO: The deployed ops service. A variable with a real default rather than an `ensureEnv` (AGENTS.md § 6.2.) — the address is fixed by `infra/jandh-ops.caddy` in that repository, and only a local run overrides it.
const OPS_API_URL = (process.env.OPS_API_URL ?? "https://jandh-ops.jeheecheon.com").replace(
  /\/$/,
  "",
);

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
  const response = await fetch(`${OPS_API_URL}${path}`, {
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
