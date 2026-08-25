import { collapseMessage } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = snowflakeSchema<MessageId>();
const bodySchema = z.object({ isCollapsed: z.boolean() });

/**
 * REQUIREMENTS.md § 8.17. Folds a message away or unfolds it, for either
 * participant — a route of its own rather than a field on the § 8.13. `PATCH`,
 * which is scoped to the sender and would have to grow a second permission model
 * to carry this one.
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);
  const body = bodySchema.safeParse(await request.json().catch(() => null));

  if (!id.success || !body.success) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 14. Not prose, already deleted, already in that state and never existed are all the 404 a missing id gets.
  if (!(await collapseMessage(id.data, body.data.isCollapsed))) {
    return apiError("not_found");
  }

  // INFO: § 8.13. No body — the folder patches its own window and every other client is told by the stream event.
  return new NextResponse(null, { status: 204 });
}
