import "server-only";

import { ensureEnv } from "@/shared/config";
import { S3Client } from "@aws-sdk/client-s3";

// WARN: Dev HMR re-evaluates this module; without the global every reload leaks another client and its socket pool.
const globalForR2 = globalThis as typeof globalThis & { jandhR2?: S3Client };

/**
 * The R2 client (REQUIREMENTS.md § 9.). Lazy for the same reason `getDb` is —
 * `ensureEnv` throws, and a build must not need the credentials.
 */
export function getR2(): S3Client {
  if (!globalForR2.jandhR2) {
    globalForR2.jandhR2 = new S3Client({
      // INFO: R2 has no regions, but the S3 protocol requires the field and Cloudflare accepts only this value.
      region: "auto",
      endpoint: `https://${ensureEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: ensureEnv("R2_ACCESS_KEY_ID"),
        secretAccessKey: ensureEnv("R2_SECRET_ACCESS_KEY"),
      },
    });
  }

  return globalForR2.jandhR2;
}

export function getBucket(): string {
  return ensureEnv("R2_BUCKET");
}
