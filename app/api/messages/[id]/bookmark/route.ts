import { addMessageBookmark, removeMessageBookmark } from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";

const idSchema = snowflakeSchema<MessageId>();

export async function PUT(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  if (!(await addMessageBookmark(user.id, id.data))) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  if (!(await removeMessageBookmark(user.id, id.data))) {
    return apiError("not_found");
  }

  return new NextResponse(null, { status: 204 });
}
