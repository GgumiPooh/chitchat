/** REQUIREMENTS.md § 12.4. One dump under `backups/` in R2. */
export type BackupSummary = {
  filename: string;
  sizeBytes: number;
  /** ISO 8601, from R2's own LastModified. */
  lastModified: string;
};
