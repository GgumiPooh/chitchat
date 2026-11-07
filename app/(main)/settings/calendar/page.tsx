import { getGoogleCalendarOverview, type GoogleCalendarOverview } from "@/entities/google-calendar";
import { CalendarSettingsPage } from "@/pages/calendar-settings";
import { encryptServerPayload, requireUserOrRedirect } from "@/shared/auth";
import type { Maybe } from "@/shared/lib";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  const user = await requireUserOrRedirect();
  const params = await searchParams;

  const connectedFlag = params.connected === "1";
  const errorParam = typeof params.error === "string" ? params.error : null;

  let overview: GoogleCalendarOverview;
  try {
    overview = await getGoogleCalendarOverview(user.id);
  } catch {
    overview = { account: null, sources: [] };
  }

  const encryptedPayload = await encryptServerPayload({
    connectedFlag,
    errorCode: errorParam,
    initialOverview: overview,
  });

  return <CalendarSettingsPage encryptedPayload={encryptedPayload} />;
}
