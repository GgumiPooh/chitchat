import { listChangedMessages } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * REQUIREMENTS.md § 8.13.1. The oldest and newest rows the asking client holds,
 * both inclusive. A client holding nothing has nothing to reconcile and does not
 * ask, so an empty window never reaches here.
 */
const querySchema = z
  .object({
    from: z.coerce.number().int().nonnegative(),
    to: z.coerce.number().int().nonnegative(),
  })
  // INFO: An inverted range is a client bug rather than an empty answer, and § 14. reports it as the 400 every other malformed query gets.
  .refine(({ from, to }) => from <= to);

/**
 * REQUIREMENTS.md § 8.13.1. What the § 8.4. catch-up cannot answer: the catch-up
 * only ever pages *forward* from the newest id this client knows, so an edit or a
 * delete landing on a row it already holds is invisible to it.
 */
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

  return NextResponse.json({
    messages: await listChangedMessages(query.data.from, query.data.to),
  });
}
