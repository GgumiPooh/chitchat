"use client";

import { TAB_ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib";
import { usePathname } from "next/navigation";
import { useState, type PropsWithChildren } from "react";

type Arrival = { pathname: string; direction: "forward" | "back" | "none" };

const tabIndexOf = (pathname: string) =>
  TAB_ROUTES.findIndex((route) => pathname === route || pathname.startsWith(`${route}/`));

// INFO: DESIGN.md § 4.7.1. Direction is the bar's own order and never history — 갤러리 must not arrive from a different side depending on where the user came from.
function directionBetween(from: string, to: string): Arrival["direction"] {
  const fromIndex = tabIndexOf(from);
  const toIndex = tabIndexOf(to);

  // INFO: Deeper navigation (설정 → 이모티콘) resolves to the same tab and stays instant, as does anything off the bar entirely.
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) {
    return "none";
  }

  return toIndex > fromIndex ? "forward" : "back";
}

export type RouteTransitionProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * Slides the arriving screen in from the side the tab it belongs to sits on
 * (DESIGN.md § 4.7.1.).
 *
 * WARN: A plain CSS animation, and deliberately not `<ViewTransition>`. A view
 * transition paints its snapshots in the **top layer**, which nothing on the
 * page can reach above — not a `z-index`, not a `popover` — so the floating bars
 * (§ 3.5.) could only stay visible over a sliding screen by being captured
 * themselves, and a separately captured element renders its transparent regions
 * as an opaque plate on WebKit. Snapshots are the whole problem; this has none.
 */
export function RouteTransition({ className, children }: RouteTransitionProps) {
  // INFO: `usePathname` is typed nullable for the Pages Router's pre-hydration render; an empty path is off the bar, which is exactly the "do not animate" case.
  const pathname = usePathname() ?? "";
  const [arrival, setArrival] = useState<Arrival>({ pathname, direction: "none" });

  // INFO: React's documented "adjust state during render" — an effect would land a frame after the screen has already been painted in place, which is a frame too late to animate it in.
  if (arrival.pathname !== pathname) {
    setArrival({ pathname, direction: directionBetween(arrival.pathname, pathname) });
  }

  return (
    // WARN: Keyed on the path so the arriving screen is a new element. Without it React reuses the node, the animation does not restart, and only the first navigation ever animates.
    <div
      key={arrival.pathname}
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        arrival.direction === "forward" && "route-enter-forward",
        arrival.direction === "back" && "route-enter-back",
        className,
      )}
    >
      {children}
    </div>
  );
}
