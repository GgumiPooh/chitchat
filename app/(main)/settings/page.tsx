import { getMediaRow } from "@/entities/media";
import { SettingsPage } from "@/pages/settings";
import { requireUserOrRedirect } from "@/shared/auth";
import { isVideoMime } from "@/shared/config";

export default async function Page() {
  // INFO: `requireUserOrRedirect` is request-cached, so this reuses the `(main)` layout's session lookup.
  const user = await requireUserOrRedirect();
  // INFO: REQUIREMENTS.md § 12.1. `users` holds the id and `media` holds the kind, and the cover cannot pick between `<img>` and `<video>` without it. One primary-key read, and only for a user who has set a cover.
  const cover = user.profileBackgroundMediaId
    ? await getMediaRow(user.profileBackgroundMediaId)
    : null;

  return <SettingsPage user={user} isProfileBackgroundVideo={isVideoMime(cover?.mime ?? "")} />;
}
