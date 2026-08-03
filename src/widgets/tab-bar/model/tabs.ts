import { CALENDAR_ROUTE, CHAT_ROUTE, GALLERY_ROUTE, SETTINGS_ROUTE } from "@/shared/config";
import { CalendarDays, Images, MessageCircle, Settings } from "lucide-react";
import type { ComponentProps, FC } from "react";

export type Tab = {
  href: string;
  label: string;
  Icon: FC<ComponentProps<"svg">>;
};

export const TABS: Tab[] = [
  { href: CHAT_ROUTE, label: "채팅", Icon: MessageCircle },
  { href: CALENDAR_ROUTE, label: "캘린더", Icon: CalendarDays },
  { href: GALLERY_ROUTE, label: "갤러리", Icon: Images },
  { href: SETTINGS_ROUTE, label: "설정", Icon: Settings },
];
