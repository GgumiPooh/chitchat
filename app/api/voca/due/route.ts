import "server-only";

import { getDueCards } from "@/entities/voca";
import { apiError } from "@/shared/api";
import { getCurrentUser } from "@/shared/auth";
import { NextResponse } from "next/server";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return apiError("unauthorized");
  }

  const result = await getDueCards(user.id);
  return NextResponse.json(result);
}
