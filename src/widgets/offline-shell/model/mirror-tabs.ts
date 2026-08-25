import { ARCHIVE_GALLERY_ROUTE, CALENDAR_ROUTE, CHAT_ROUTE, SETTINGS_ROUTE } from "@/shared/config";
import type { Optional } from "@/shared/lib";
import { Archive, CalendarDays, MessageCircle, Settings } from "lucide-react";
import type { ComponentProps, FC } from "react";
import type { MirrorScreen } from "./mirror-screen";

export type MirrorTab = {
  screens: MirrorScreen[];
  href: string;
  label: string;
  Icon: FC<ComponentProps<"svg">>;
};

// INFO: DESIGN.md § 7.3.'s four faces, in `TAB_ROUTES` order. Declared again rather than imported because `widgets/tab-bar` publishes neither `TABS` nor a URL-inert bar.
export const MIRROR_TABS: MirrorTab[] = [
  { screens: ["chat"], href: CHAT_ROUTE, label: "채팅", Icon: MessageCircle },
  { screens: ["calendar"], href: CALENDAR_ROUTE, label: "캘린더", Icon: CalendarDays },
  {
    screens: ["gallery", "files", "voice"],
    href: ARCHIVE_GALLERY_ROUTE,
    label: "보관함",
    Icon: Archive,
  },
  { screens: ["settings"], href: SETTINGS_ROUTE, label: "설정", Icon: Settings },
];

export function toActiveTabIndex(screen: Optional<MirrorScreen>) {
  return MIRROR_TABS.findIndex((tab) => screen !== undefined && tab.screens.includes(screen));
}
