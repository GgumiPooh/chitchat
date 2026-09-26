import "server-only";

import { getVocaHeatmap } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const url = new URL(request.url);
  const weeksParam = url.searchParams.get("weeks");
  const weeks = weeksParam ? Math.min(Math.max(1, parseInt(weeksParam, 10)), 52) : 52;

  const heatmap = await getVocaHeatmap(user.id, weeks);
  return NextResponse.json({ heatmap });
}
