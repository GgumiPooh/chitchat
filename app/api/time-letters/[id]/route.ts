import "server-only";

import { cancelTimeLetter, getTimeLetter } from "@/entities/time-letter";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { snowflakeSchema } from "@/shared/config";
import type { TimeLetterId } from "@/shared/lib";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type RouteParams = { params: Promise<{ id: string }> };

const paramsSchema = snowflakeSchema<TimeLetterId>();

export async function GET(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const idParsed = paramsSchema.safeParse((await params).id);
  if (!idParsed.success) {
    return apiError("invalid_request");
  }

  const letter = await getTimeLetter({
    letterId: idParsed.data,
    currentUserId: user.id,
  });

  if (!letter) {
    return apiError("not_found");
  }

  return NextResponse.json({ letter });
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const idParsed = paramsSchema.safeParse((await params).id);
  if (!idParsed.success) {
    return apiError("invalid_request");
  }

  try {
    const success = await cancelTimeLetter({
      letterId: idParsed.data,
      userId: user.id,
    });

    if (!success) {
      return apiError("not_found");
    }

    return new NextResponse(null, { status: 204 });
  } catch {
    return apiError("invalid_request");
  }
}
