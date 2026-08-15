import { request } from "@/shared/api";
import { OPS_BACKUPS_PATH } from "@/shared/config";
import { OpsRequestError } from "../model/ops-error";
import type { BackupRunResult, BackupSummary } from "../model/types";

/** REQUIREMENTS.md § 12.4. The stored dumps, newest first — jandh-ops sorts them, so this keeps the order it answers. */
export async function fetchBackups(): Promise<BackupSummary[]> {
  const response = await request(OPS_BACKUPS_PATH);

  if (!response.ok) {
    throw new OpsRequestError("GET", OPS_BACKUPS_PATH, response.status);
  }

  const { backups } = (await response.json()) as { backups: BackupSummary[] };

  return backups;
}

/** REQUIREMENTS.md § 12.4. Runs a backup now. Minutes-long on a large database — jandh-ops pushes the verdict either way. */
export async function runBackup(): Promise<BackupRunResult> {
  const response = await request(OPS_BACKUPS_PATH, { method: "POST" });

  if (!response.ok) {
    throw new OpsRequestError("POST", OPS_BACKUPS_PATH, response.status);
  }

  return (await response.json()) as BackupRunResult;
}

/** REQUIREMENTS.md § 12.4. Deletes one dump. Throws on anything but a 2xx, 404 included. */
export async function deleteBackup(filename: string): Promise<void> {
  const path = `${OPS_BACKUPS_PATH}/${encodeURIComponent(filename)}`;
  const response = await request(path, { method: "DELETE" });

  if (!response.ok) {
    throw new OpsRequestError("DELETE", path, response.status);
  }
}
