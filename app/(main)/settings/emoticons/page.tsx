import { listEmoticonPacks } from "@/entities/emoticon";
import { EmoticonSettingsPage } from "@/pages/emoticon-settings";
import { requireUserOrRedirect } from "@/shared/auth";

/**
 * INFO: REQUIREMENTS.md § 13.5. The enabled packs only, and the whole of them. That
 * is the 사용중 tab's list — thirty-odd rows, which is what lets it be dragged whole;
 * the library the other tab browses is ten thousand and is paged in the browser.
 */
export default async function EmoticonSettingsRoute() {
  const user = await requireUserOrRedirect();

  return <EmoticonSettingsPage packs={await listEmoticonPacks(user.id, { enabledOnly: true })} />;
}
