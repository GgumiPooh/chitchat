import { syncUserGoogleCalendar } from "@/entities/google-calendar";
import { apiError } from "@/shared/api";
import { getCurrentUser, withEncryptedRoute } from "@/shared/auth";
import { NextResponse } from "next/server";

export const POST = withEncryptedRoute(async () => {
  const user = await getCurrentUser();

  if (!user) {
    return apiError("unauthorized");
  }

  const result = await syncUserGoogleCalendar(user.id, {
    source: "manual",
    waitForInFlight: true,
  });

  return NextResponse.json(result);
});
