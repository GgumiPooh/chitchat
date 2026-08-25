import { listAgentOptions } from "@/features/ask-ai";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { llmAgentOptionsSchema } from "@/shared/config";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  return NextResponse.json(llmAgentOptionsSchema.parse({ agents: await listAgentOptions() }));
}
