import "server-only";

import { getVocaUserSettings, updateVocaUserSettings } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { VOCA_REMINDER_COOKIE_NAME, VOCA_REMINDER_COOKIE_OPTIONS } from "@/shared/config";
import { NextResponse } from "next/server";
import { z } from "zod";

const settingsPatchSchema = z.object({
  dailyNewCards: z.number().int().min(1).max(100).optional(),
  dailyReviewLimit: z.number().int().min(1).max(1000).nullable().optional(),
  reminderEnabled: z.boolean().optional(),
  desiredRetention: z.number().min(0.7).max(0.99).optional(),
  todayExtraNewCards: z.number().int().min(0).max(50).optional(),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const settings = await getVocaUserSettings(user.id);
  return NextResponse.json({ settings });
}

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const json = await request.json().catch(() => null);
  const parsed = settingsPatchSchema.safeParse(json);
  if (!parsed.success) {
    return apiError("invalid_request");
  }

  const settings = await updateVocaUserSettings(user.id, parsed.data);
  const response = NextResponse.json({ settings });

  if (parsed.data.reminderEnabled !== undefined) {
    response.cookies.set(
      VOCA_REMINDER_COOKIE_NAME,
      String(parsed.data.reminderEnabled),
      VOCA_REMINDER_COOKIE_OPTIONS,
    );
  }

  return response;
}
