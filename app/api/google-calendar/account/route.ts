import {
  disconnectGoogleCalendarAccount,
  getGoogleCalendarOverview,
  updateGoogleCalendarDefault,
} from "@/entities/google-calendar";
import { apiError } from "@/shared/api";
import { getCurrentUser, withEncryptedRoute } from "@/shared/auth";
import { NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  defaultCalendarId: z.string().trim().min(1).max(255),
});

export const GET = withEncryptedRoute(async () => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const overview = await getGoogleCalendarOverview(user.id);

  return NextResponse.json(overview);
});

export const PATCH = withEncryptedRoute(async (request: Request) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const body = patchSchema.safeParse(await request.json().catch(() => null));

  if (!body.success) {
    return apiError("invalid_request");
  }

  const overview = await updateGoogleCalendarDefault(user.id, body.data.defaultCalendarId);

  if (!overview) {
    return apiError("invalid_request");
  }

  return NextResponse.json(overview);
});

export const DELETE = withEncryptedRoute(async () => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  await disconnectGoogleCalendarAccount(user.id);

  return new NextResponse(null, { status: 204 });
});
