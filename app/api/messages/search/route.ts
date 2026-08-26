import { countMatchingMessages, searchMessages } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_SEARCH_QUERY_LENGTH, SEARCH_PAGE_SIZE, snowflakeSchema } from "@/shared/config";
import type { MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

// INFO: REQUIREMENTS.md § 8.6. Trimmed and lowercased here so the pattern the query builds is the same one whatever the caller sent; `ILIKE` makes the case fold a normalization rather than a behaviour change.
const querySchema = z.object({
  q: z.string().trim().toLowerCase().min(1).max(MAX_SEARCH_QUERY_LENGTH),
  before: snowflakeSchema<MessageId>().optional(),
  hideOthers: z.coerce.boolean().optional().default(false),
});

// INFO: AGENTS.md § 6.4. A Route Handler returns its own 401 — the App Router does not honour a thrown `Response`.
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const query = querySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );

  if (!query.success) {
    return apiError("invalid_request");
  }

  const { q, before, hideOthers } = query.data;
  // INFO: The counter beside the field is a property of the whole query, not of the page — so it is asked for once, on the page that has no cursor behind it, and carried by the client from there.
  // WARN: Started together, never awaited one after the other. The count is the slower half — it cannot be `LIMIT`ed and scans every match — so a sequential pair makes every submit wait for the sum of the two rather than the longer of them.
  const [results, total] = await Promise.all([
    searchMessages({ query: q, before, limit: SEARCH_PAGE_SIZE, currentUserId: user.id, hideOthers }),
    before === undefined ? countMatchingMessages(q, user.id, hideOthers) : undefined,
  ]);

  return NextResponse.json({ results, total });
}
