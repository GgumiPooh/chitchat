import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { answerOps } from "@/shared/ops";
import { z } from "zod";

// INFO: Dry-run is the default on both sides, so an omitted flag — and a bodyless POST, which jandh-ops itself accepts — previews rather than deleting.
const bodySchema = z.object({ dryRun: z.boolean() }).partial();

/** REQUIREMENTS.md § 12.4. The R2 sweep for objects no live `media` row can name. */
export async function POST(request: Request) {
  if (!(await getCurrentUser())) {
    return apiError("unauthorized");
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
