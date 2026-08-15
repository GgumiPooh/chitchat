import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { answerOps } from "@/shared/ops";

type RouteParams = { params: Promise<{ filename: string }> };

/**
 * WARN: The same anchored shape jandh-ops validates against, spelled out again here.
 * That side interpolates the name into an `aws s3 rm` shell command, so a name is
 * rejected at both ends rather than trusted across the hop.
 */
const BACKUP_FILENAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(dump|sql\.gz)$/;

/** REQUIREMENTS.md § 12.4. Deletes one dump. Authenticated to jandh-ops with the cleanup secret. */
export async function DELETE(_request: Request, { params }: RouteParams) {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  const { filename } = await params;

  if (!BACKUP_FILENAME_PATTERN.test(filename)) {
    return apiError("invalid_request");
  }

  return answerOps(`/api/backups/${encodeURIComponent(filename)}`, {
    method: "DELETE",
    credential: "cleanup",
  });
}
