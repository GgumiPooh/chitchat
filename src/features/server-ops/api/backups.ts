import { request } from "@/shared/api";
import { OPS_BACKUPS_PATH } from "@/shared/config";
import { OpsRequestError } from "../model/ops-error";
import type { BackupSummary } from "../model/types";

/** REQUIREMENTS.md § 12.4. The stored dumps, newest first — the route sorts them, so this keeps the order it answers. */
export async function fetchBackups(): Promise<BackupSummary[]> {
  const response = await request(OPS_BACKUPS_PATH);

  if (!response.ok) {
    throw new OpsRequestError("GET", OPS_BACKUPS_PATH, response.status);
  }

  const { backups } = (await response.json()) as { backups: BackupSummary[] };

  return backups;
}

/**
 * REQUIREMENTS.md § 12.4. Asks for a backup run.
 *
 * WARN: It answers when the run has been QUEUED, not when the dump is in the bucket.
 * `pg_dump` streams for minutes inside a workflow, and the push notification it sends is
 * what reports success — so the caller may say 요청했어요 and nothing stronger.
 */
export async function runBackup(): Promise<void> {
  const response = await request(OPS_BACKUPS_PATH, { method: "POST" });

  if (!response.ok) {
    throw new OpsRequestError("POST", OPS_BACKUPS_PATH, response.status);
  }
}

/** REQUIREMENTS.md § 12.4. Deletes one dump. Throws on anything but a 2xx, 404 included. */
export async function deleteBackup(filename: string): Promise<void> {
  const path = `${OPS_BACKUPS_PATH}/${encodeURIComponent(filename)}`;
  const response = await request(path, { method: "DELETE" });

  if (!response.ok) {
    throw new OpsRequestError("DELETE", path, response.status);
  }
}
