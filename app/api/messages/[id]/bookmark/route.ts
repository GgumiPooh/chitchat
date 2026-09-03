import {
  addMessageBookmark,
  removeMessageBookmark,
  renameMessageBookmark,
} from "@/entities/message";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { MAX_BOOKMARK_NAME_LENGTH, snowflakeSchema } from "@/shared/config";
import type { MessageId } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

const idSchema = snowflakeSchema<MessageId>();

const renameSchema = z.object({ name: z.string().trim().min(1).max(MAX_BOOKMARK_NAME_LENGTH) });

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

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const id = idSchema.safeParse((await params).id);

  if (!id.success) {
    return apiError("invalid_request");
  }

  const body = renameSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  if (!(await renameMessageBookmark(user.id, id.data, body.data.name))) {
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
