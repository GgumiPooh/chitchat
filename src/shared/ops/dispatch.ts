import "server-only";

import { ensureEnv } from "@/shared/config";

/**
 * REQUIREMENTS.md § 12.4. The repository whose workflows hold the ops jobs. A variable with
 * a real default rather than an `ensureEnv` — it is this repository, and only a fork needs
 * to say otherwise.
 */
const OPS_REPO = process.env.OPS_GITHUB_REPO?.trim() || "GgumiPooh/jandh";

/** The branch a dispatched run checks out. `schedule` only ever fires on the default one, so this matches it. */
const OPS_REF = process.env.OPS_GITHUB_REF?.trim() || "main";

export const OPS_BACKUP_WORKFLOW = "ops-backup.yml";
export const OPS_SWEEP_WORKFLOW = "ops-sweep.yml";

/**
 * REQUIREMENTS.md § 12.4. Whether this deployment can start an ops run.
 *
 * INFO: The token is the whole question. Everything else has a default, and without one
 * there is nothing to authenticate a dispatch with — so 서버 관리 hides 백업 생성 and the
 * sweep exactly where this is false. The backup list and the per-backup deletion do not
 * consult it: they read R2 directly.
 */
export function isOpsDispatchConfigured(): boolean {
  return Boolean(process.env.OPS_GITHUB_TOKEN?.trim());
}

/**
 * Asks GitHub to start one of the ops workflows and answers once it has accepted.
 *
 * WARN: This is a REQUEST, not a result. `workflow_dispatch` answers 204 the moment the run
 * is queued and says nothing about how it goes — the screen must say "asked for" rather than
 * "done", and the run's own push notification is what reports the outcome. A dump takes
 * minutes; there is no response to wait for even if the caller wanted to.
 *
 * WARN: Inputs cross as strings whatever a workflow declares them as, so a `boolean` input
 * must be sent as `"true"` / `"false"`. GitHub rejects the dispatch outright otherwise.
 *
 * Throws with GitHub's status when the dispatch is refused, which the route turns into a
 * § 14. code — a 404 here is usually the token lacking `actions: write` rather than a
 * missing workflow, since GitHub hides what a token may not see.
 */
export async function dispatchOpsWorkflow(
  workflow: string,
  inputs: Record<string, string> = {},
): Promise<void> {
  const response = await fetch(
    `https://api.github.com/repos/${OPS_REPO}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ensureEnv("OPS_GITHUB_TOKEN")}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ref: OPS_REF, inputs }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    // INFO: The body carries GitHub's own message; it stays in the server log rather than crossing to the client, as every ops failure detail has.
    console.error(
      `[ops] dispatching ${workflow} answered ${response.status}`,
      await response.text().catch(() => ""),
    );

    throw new OpsDispatchError(response.status);
  }
}

/** A refused dispatch, carrying GitHub's status so the route can map it to a § 14. code. */
export class OpsDispatchError extends Error {
  constructor(readonly status: number) {
    super(`workflow dispatch failed with ${status}`);
    this.name = "OpsDispatchError";
  }
}
