import {
  CALENDAR_ROUTE,
  CHAT_ROUTE,
  GALLERY_ROUTE,
  SETTINGS_ROUTE,
  TAB_ROUTES,
  type TabRoute,
} from "@/shared/config";
import { Archive, CalendarDays, MessageCircle, Settings } from "lucide-react";
import type { ComponentProps, FC } from "react";

export type Tab = {
  href: string;
  label: string;
  Icon: FC<ComponentProps<"svg">>;
};

type TabFace = Pick<Tab, "label" | "Icon">;

// WARN: Keyed by `TabRoute`, not `string`. A route added to `TAB_ROUTES` without a face here has to be a compile error — widened, it is an `undefined` `Icon` that blanks the whole shell at render.
const TAB_FACES: Record<TabRoute, TabFace> = {
  [CHAT_ROUTE]: { label: "채팅", Icon: MessageCircle },
  [CALENDAR_ROUTE]: { label: "캘린더", Icon: CalendarDays },
  // WARN: The label is 보관함 while the route stays `/gallery` (REQUIREMENTS.md § 10.). The two are allowed to differ, as `/settings/emoticons` is 이모티콘 관리 — renaming the route would churn the widget, the API and every § 10. citation for a string nobody sees.
  [GALLERY_ROUTE]: { label: "보관함", Icon: Archive },
  [SETTINGS_ROUTE]: { label: "설정", Icon: Settings },
};

// WARN: DESIGN.md § 4.7.1. Built from `TAB_ROUTES` rather than listing the routes again — `RouteTransition` reads the slide direction off that same order, and two lists would let the bar and the motion disagree about which way 보관함 sits.
export const TABS: Tab[] = TAB_ROUTES.map((href) => ({ href, ...TAB_FACES[href] }));
