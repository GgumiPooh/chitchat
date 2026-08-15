import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { deleteBackup, isBackupFilename } from "@/shared/storage";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ filename: string }> };

/**
 * REQUIREMENTS.md § 12.4. Deletes one dump, straight from R2.
 *
 * INFO: No longer proxied to jandh-ops, and no longer carrying that service's
 * `CLEANUP_TOKEN`. The bucket is the app's own (§ 9.), so the deletion is one credential
 * fewer rather than one more.
 *
 * WARN: A missing dump is a 404 even though `DeleteObject` would have succeeded — the
 * screen was drawn from a listing, and a row that is gone has to say so rather than
 * report a deletion that removed nothing.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  const { filename } = await params;

  if (!isBackupFilename(filename)) {
    return apiError("invalid_request");
  }

  try {
    const deleted = await deleteBackup(filename);

    if (deleted === null) {
      return apiError("not_found");
    }

    return NextResponse.json({ success: true, ...deleted });
  } catch (error) {
    console.error(`[ops] could not delete backup ${filename}`, error);

    return apiError("upstream_failed");
  }
}
