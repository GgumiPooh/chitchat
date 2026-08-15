import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { answerOps, isOpsConfigured } from "@/shared/ops";
import { z } from "zod";

// INFO: Dry-run is the default on both sides, so an omitted flag — and a bodyless POST, which jandh-ops itself accepts — previews rather than deleting.
const bodySchema = z.object({ dryRun: z.boolean() }).partial();

/** REQUIREMENTS.md § 12.4. The R2 sweep for objects no live `media` row can name. */
export async function POST(request: Request) {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
  }

  // INFO: The sweep has no copy in this app — it subtracts the database from a whole bucket listing — so without jandh-ops there is nothing to ask.
  if (!isOpsConfigured()) {
    return apiError("unavailable");
  }

  const body = bodySchema.safeParse(await request.json().catch(() => ({})));

  if (!body.success) {
    return apiError("invalid_request");
  }

  return answerOps("/api/cleanup-orphans", {
    method: "POST",
    credential: "cleanup",
    body: { dryRun: body.data.dryRun !== false },
  });
}
