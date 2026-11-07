import { syncAllGoogleCalendars } from "@/entities/google-calendar";
import { apiError } from "@/shared/api";
import { isOpsCronConfigured, isOpsCronRequest } from "@/shared/ops";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!isOpsCronConfigured()) {
    return apiError("unavailable");
  }

  if (!isOpsCronRequest(request)) {
    return apiError("unauthorized");
  }

  const report = await syncAllGoogleCalendars();

  return NextResponse.json(report);
}
