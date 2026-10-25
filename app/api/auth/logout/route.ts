import { clearSessionCookie, invalidateCurrentSession, setPinResetCookie } from "@/shared/auth";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (new URL(request.url).searchParams.get("resetPin") === "1") {
    await setPinResetCookie();
  }

  await invalidateCurrentSession();
  await clearSessionCookie();

  return new NextResponse(null, { status: 204 });
}
