import { redirectTo } from "@/shared/api";
import { clearSessionCookie, getCurrentUser } from "@/shared/auth";
import { HOME_ROUTE, LOGIN_ROUTE } from "@/shared/config";

export async function GET() {
  // WARN: A cross-site `<img src>` can reach this route with the cookie attached, so a still-valid session must survive it — otherwise any page on the web could log the user out.
  if (await getCurrentUser()) {
    return redirectTo(HOME_ROUTE);
  }

  await clearSessionCookie();

  return redirectTo(LOGIN_ROUTE);
}
