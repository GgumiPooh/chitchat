import {
  CALENDAR_ROUTE,
  CHAT_ROUTE,
  GALLERY_ROUTE,
  SETTINGS_ROUTE,
  TAB_ROUTES,
} from "@/shared/config";
import { CalendarDays, Images, MessageCircle, Settings } from "lucide-react";
import type { ComponentProps, FC } from "react";

export type Tab = {
  href: string;
  label: string;
  Icon: FC<ComponentProps<"svg">>;
};

type TabFace = Pick<Tab, "label" | "Icon">;

const TAB_FACES: Record<string, TabFace> = {
  [CHAT_ROUTE]: { label: "채팅", Icon: MessageCircle },
  [CALENDAR_ROUTE]: { label: "캘린더", Icon: CalendarDays },
  [GALLERY_ROUTE]: { label: "갤러리", Icon: Images },
  [SETTINGS_ROUTE]: { label: "설정", Icon: Settings },
};

// WARN: DESIGN.md § 4.7.1. Built from `TAB_ROUTES` rather than listing the routes again — `RouteTransition` reads the slide direction off that same order, and two lists would let the bar and the motion disagree about which way 갤러리 sits.
export const TABS: Tab[] = TAB_ROUTES.map((href) => ({ href, ...TAB_FACES[href] }));
