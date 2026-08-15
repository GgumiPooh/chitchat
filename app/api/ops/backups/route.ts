import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { answerOps } from "@/shared/ops";

/** REQUIREMENTS.md § 12.4. The dumps jandh-ops keeps in R2, newest first. */
export async function GET() {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  return answerOps("/api/backups", { method: "GET", credential: "backup" });
}

/** REQUIREMENTS.md § 12.4. Runs a backup now. The response also lists the dumps retention dropped. */
export async function POST() {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  return answerOps("/api/backup", { method: "POST", credential: "backup" });
}
