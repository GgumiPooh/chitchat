import { deleteMessage } from "@/entities/message";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const id = idSchema.safeParse((await params).id);

  if (!id.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  // INFO: REQUIREMENTS.md § 14. A message that is not this user's is reported the same as one that does not exist.
  if (!(await deleteMessage(id.data, user.id))) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return new NextResponse(null, { status: 204 });
}
