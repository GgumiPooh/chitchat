import { removeEmoticonFavorite } from "@/entities/emoticon";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { EmoticonItemId } from "@/shared/lib";
import { NextResponse } from "next/server";

export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const params = await props.params;
  const parsedId = snowflakeSchema<EmoticonItemId>().safeParse(params.id);

  if (!parsedId.success) {
    return apiError("invalid_request");
  }

  await removeEmoticonFavorite(user.id, parsedId.data);

  return new NextResponse(null, { status: 204 });
}
