import {
  getGoogleCalendarOverview,
  refreshAndGetGoogleCalendarSources,
  syncUserGoogleCalendar,
  updateGoogleCalendarSourceSelection,
} from "@/entities/google-calendar";
import { apiError } from "@/shared/api";
import { getCurrentUser, withEncryptedRoute } from "@/shared/auth";
import { safelyRunAsync } from "@/shared/lib";
import { after, NextResponse } from "next/server";
import { z } from "zod";

const patchSchema = z.object({
  sources: z
    .array(
      z.object({
        calendarId: z.string().trim().min(1).max(255),
        syncEnabled: z.boolean(),
      }),
    )
    .min(1)
    .max(100),
});

export const GET = withEncryptedRoute(async (request: Request) => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const shouldRefresh = new URL(request.url).searchParams.get("refresh") === "1";
  const overview = shouldRefresh
    ? await refreshAndGetGoogleCalendarSources(user.id)
    : await getGoogleCalendarOverview(user.id);

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

  const overview = await updateGoogleCalendarSourceSelection(user.id, body.data.sources);

  if (body.data.sources.some((source) => source.syncEnabled)) {
    after(() =>
      safelyRunAsync(async () => {
        await syncUserGoogleCalendar(user.id);
      }),
    );
  }

  return NextResponse.json(overview);
});
