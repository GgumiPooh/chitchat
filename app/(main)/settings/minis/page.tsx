import { listEmoticonPacks } from "@/entities/emoticon";
import { EmoticonSettingsPage } from "@/pages/emoticon-settings";
import { requireUserOrRedirect } from "@/shared/auth";

/**
 * REQUIREMENTS.md § 13. 미니이모티콘's own management screen — the same component as
 * 이모티콘 관리, told which kind it is managing.
 *
 * INFO: § 13.5. The enabled packs only, and the whole of them, exactly as the other
 * kind's screen reads them.
 */
export default async function MiniSettingsRoute() {
  const user = await requireUserOrRedirect();

  return (
    <EmoticonSettingsPage
      type="mini"
      packs={await listEmoticonPacks(user.id, { type: "mini", enabledOnly: true })}
    />
  );
}
