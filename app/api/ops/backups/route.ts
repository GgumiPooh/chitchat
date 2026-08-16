import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import {
  dispatchOpsWorkflow,
  isOpsDispatchConfigured,
  OPS_BACKUP_WORKFLOW,
  toDispatchErrorCode,
} from "@/shared/ops";
import { listBackups } from "@/shared/storage";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 12.4. The dumps in R2, newest first.
 *
 * INFO: Read straight from the bucket. The dumps share the app's own bucket, so this needs
 * no credential that § 9. did not already have.
 */
export async function GET() {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  try {
    return NextResponse.json({ backups: await listBackups() });
  } catch (error) {
    console.error("[ops] could not list backups", error);

    // WARN: Never an empty list. A bucket that could not be read would otherwise draw 아직 백업이 없어요 over a shelf full of dumps.
    return apiError("upstream_failed");
  }
}

/**
 * REQUIREMENTS.md § 12.4. Asks for a backup run and answers 202 once GitHub has queued it.
 *
 * WARN: 202 and not 200 — this starts the same workflow the 05:00 schedule does and does
 * NOT wait for it. `pg_dump` runs for minutes and the dispatch answers immediately, so the
 * screen says 요청했어요 and the run's push notification is what reports the outcome.
 */
export async function POST() {
  const requester = await getCurrentUser();

  if (!requester) {
    return apiError("unauthorized");
  }

  // INFO: The screen hides 백업 생성 without a token, so this is the path a stale client takes rather than one a button offers.
  if (!isOpsDispatchConfigured()) {
    return apiError("unavailable");
  }

  /**
   * WARN: The requester's own address, not the deployment default. 서버 관리 is reachable
   * by BOTH allowlisted accounts and the modal promises the result by notification, so a
   * fixed recipient answers on the other person's phone and leaves the presser with nothing.
   */
  try {
    await dispatchOpsWorkflow(OPS_BACKUP_WORKFLOW, { "notify-email": requester.email });

    return NextResponse.json({ accepted: true }, { status: 202 });
  } catch (error) {
    return apiError(toDispatchErrorCode(error));
  }
}
