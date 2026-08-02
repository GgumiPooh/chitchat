import { clearSessionCookie } from "@/shared/auth";
import { LOGIN_ROUTE } from "@/shared/config";
import { NextResponse, type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  await clearSessionCookie();

  return NextResponse.redirect(new URL(LOGIN_ROUTE, request.url));
}
