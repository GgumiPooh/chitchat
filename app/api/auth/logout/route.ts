import { clearSessionCookie, invalidateCurrentSession } from "@/shared/auth";
import { NextResponse } from "next/server";

export async function POST() {
  await invalidateCurrentSession();
  await clearSessionCookie();

  return new NextResponse(null, { status: 204 });
}
