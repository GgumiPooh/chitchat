import { deleteMessage } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = z.coerce.number().int().positive();

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  // INFO: REQUIREMENTS.md § 14. A message that is not this user's is reported the same as one that does not exist.
  if (!(await deleteMessage(id.data, user.id))) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}
