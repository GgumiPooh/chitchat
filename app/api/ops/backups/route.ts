import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { answerOps, isOpsConfigured } from "@/shared/ops";
import { listBackups } from "@/shared/storage";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 12.4. The dumps in R2, newest first.
 *
 * INFO: Read straight from the bucket rather than proxied to jandh-ops. The dumps share
 * the app's own bucket, so this needs no credential that § 9. did not already have — and
 * reading them here is what lets the list outlive that service.
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
 * REQUIREMENTS.md § 12.4. Runs a backup now. The response also lists the dumps retention dropped.
 *
 * INFO: Still jandh-ops' — `pg_dump` is a binary this app does not carry.
 */
export async function POST() {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  // INFO: The 서버 관리 screen hides 백업 생성 without an ops service, so this is the path a stale client takes rather than one a button offers.
  if (!isOpsConfigured()) {
    return apiError("unavailable");
  }

  return answerOps("/api/backup", { method: "POST", credential: "backup" });
}
