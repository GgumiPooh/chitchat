"use client";

import { TAB_ROUTES, isUnderRoute } from "@/shared/config";
import { cn } from "@/shared/lib";
import { usePathname } from "next/navigation";
import { useState, type PropsWithChildren } from "react";

/** INFO: `run` counts animated arrivals only — it is the element key, and a key that moved on every navigation would remount screens that are not animating at all. */
type Arrival = { pathname: string; direction: "forward" | "back" | "none"; run: number };

const tabIndexOf = (pathname: string) =>
  TAB_ROUTES.findIndex((route) => isUnderRoute(pathname, route));

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
  const [arrival, setArrival] = useState<Arrival>({ pathname, direction: "none", run: 0 });

  // INFO: React's documented "adjust state during render" — an effect would land a frame after the screen has already been painted in place, which is a frame too late to animate it in.
  if (arrival.pathname !== pathname) {
    const direction = directionBetween(arrival.pathname, pathname);

    setArrival({
      pathname,
      direction,
      run: direction === "none" ? arrival.run : arrival.run + 1,
    });
  }

  return (
    // WARN: Keyed so an animated arrival is a new element — React would otherwise reuse the node and only the first navigation would ever animate. It counts animated arrivals rather than naming the path, because a key that changed on every navigation would tear down and rebuild 이모티콘 팩 A → 팩 B, discarding its state and queries for an animation that does not even run.
    <div
      key={arrival.run}
      className={cn(
        "flex min-h-0 flex-1 flex-col",
        arrival.direction === "forward" && "route-enter-forward",
        arrival.direction === "back" && "route-enter-back",
        className,
      )}
    >
      {children}
      {/* INFO: DESIGN.md § 3.5. The bars' clearance, and it has to live inside this box rather than as the scroller's end padding — the screen overflows out of this clamped flex item, so only a sibling it pushes down grows the scrollable area. */}
      {/* WARN: `shrink-0`, or the overflowing screen squeezes it back to nothing and the last row returns to sitting under the bars. */}
      <div className="h-(--bottom-inset) shrink-0" />
    </div>
  );
}
