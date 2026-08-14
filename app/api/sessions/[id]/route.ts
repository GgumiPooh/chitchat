import { revokeUserSession } from "@/entities/session";
import { apiError } from "@/shared/api";
import { getSessionContext } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { SessionId } from "@/shared/lib";
import { NextResponse } from "next/server";

type RouteParams = { params: Promise<{ id: string }> };

const sessionIdSchema = snowflakeSchema<SessionId>();

/**
 * REQUIREMENTS.md § 12. Revokes one of the caller's own other sessions.
 *
 * WARN: The id is validated as a UUID before it reaches the query. `sessions.id` is a
 * `uuid` column, so Postgres raises `22P02` on anything else — which would leave a
 * malformed path segment surfacing as a 500 instead of the 400 it is.
 */
export async function DELETE(_request: Request, { params }: RouteParams) {
  const context = await getSessionContext();

  if (!context) {
    return apiError("unauthorized");
  }

  const id = sessionIdSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  // INFO: A 404 covers "not yours", "already gone" and "that is the session you are on" alike — the list is the only caller and none of the three is worth telling apart on screen.
  if (!(await revokeUserSession(context.user.id, id.data, context.session.id))) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}
