import {
  CALENDAR_ROUTE,
  CHAT_ROUTE,
  GALLERY_ROUTE,
  SETTINGS_ROUTE,
  TAB_ROUTES,
  type TabRoute,
} from "@/shared/config";
import { CalendarDays, Images, MessageCircle, Settings } from "lucide-react";
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
  [GALLERY_ROUTE]: { label: "갤러리", Icon: Images },
  [SETTINGS_ROUTE]: { label: "설정", Icon: Settings },
};

// WARN: DESIGN.md § 4.7.1. Built from `TAB_ROUTES` rather than listing the routes again — `RouteTransition` reads the slide direction off that same order, and two lists would let the bar and the motion disagree about which way 갤러리 sits.
export const TABS: Tab[] = TAB_ROUTES.map((href) => ({ href, ...TAB_FACES[href] }));
