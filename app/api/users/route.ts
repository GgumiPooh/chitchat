import { listUsers } from "@/entities/user";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

/**
 * REQUIREMENTS.md § 8.4. The whole participant set, deliberately without a cursor
 * — a rename produces no new row, so an id cursor would never fire and an
 * `updated_at` one would still miss a deletion. Two rows are cheaper to refetch
 * whole. Serves first render, a `user` SSE event, and the resume catch-up alike.
 */
export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ users: await listUsers() });
}
