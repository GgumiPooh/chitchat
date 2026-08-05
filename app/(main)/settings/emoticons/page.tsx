import { listEmoticonPacks } from "@/entities/emoticon";
import { EmoticonSettingsPage } from "@/pages/emoticon-settings";
import { requireUserOrRedirect } from "@/shared/auth";

export default async function EmoticonSettingsRoute() {
  const user = await requireUserOrRedirect();

  return <EmoticonSettingsPage packs={await listEmoticonPacks(user.id)} />;
}
