import {
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_ROUTE,
  CALENDAR_ROUTE,
  CHAT_ROUTE,
  SETTINGS_ROUTE,
  TAB_ROUTES,
  type TabRoute,
} from "@/shared/config";
import { Archive, CalendarDays, MessageCircle, Settings } from "lucide-react";
import type { ComponentProps, FC } from "react";

export type Tab = {
  /** The prefix the bar fills from and `RouteTransition` orders by — a `TabRoute`, never the link. */
  route: TabRoute;
  /** Where the tap actually goes. The same as `route` for every tab but 보관함. */
  href: string;
  label: string;
  Icon: FC<ComponentProps<"svg">>;
};

type TabFace = Pick<Tab, "label" | "Icon"> & Partial<Pick<Tab, "href">>;

// WARN: Keyed by `TabRoute`, not `string`. A route added to `TAB_ROUTES` without a face here has to be a compile error — widened, it is an `undefined` `Icon` that blanks the whole shell at render.
const TAB_FACES: Record<TabRoute, TabFace> = {
  [CHAT_ROUTE]: { label: "채팅", Icon: MessageCircle },
  [CALENDAR_ROUTE]: { label: "캘린더", Icon: CalendarDays },
  // INFO: REQUIREMENTS.md § 7. The route was `/gallery` until the tab grew three shelves and `/gallery/files` started reading as "files are part of the gallery" — `/archive` is what the label has said since.
  // WARN: REQUIREMENTS.md § 10. The one tab whose `href` is not its route. `ARCHIVE_ROUTE` is a prefix with no screen — it redirects — so it must stay the *key* (that is what `isUnderRoute` fills all three shelves from, and what DESIGN.md § 4.7.1. orders the slide by) while the tap goes straight to 사진 and spends no redirect.
  [ARCHIVE_ROUTE]: { label: "보관함", Icon: Archive, href: ARCHIVE_GALLERY_ROUTE },
  [SETTINGS_ROUTE]: { label: "설정", Icon: Settings },
};

// WARN: DESIGN.md § 4.7.1. Built from `TAB_ROUTES` rather than listing the routes again — `RouteTransition` reads the slide direction off that same order, and two lists would let the bar and the motion disagree about which way 보관함 sits. Splitting `href` off above does not weaken that: the order and the membership still come from `TAB_ROUTES` alone.
export const TABS: Tab[] = TAB_ROUTES.map((route) => {
  const { href = route, ...face } = TAB_FACES[route];

  return { route, href, ...face };
});
