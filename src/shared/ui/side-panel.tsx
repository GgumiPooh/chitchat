import { cn } from "@/shared/lib";
import type { PropsWithChildren } from "react";

export type SidePanelProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * AGENTS.md § 4.4. The `lg` side panel `TwoPane` and `ChatScreen`
 * both render — collapsible via `useSidePanel`, animating `--pane-width` between
 * `0px` and `--pane-open-width`. The inner wrapper holds the open width so
 * content does not reflow while the outer box's width does.
 *
 * WARN: `bg-canvas` is explicit rather than inherited — `ChatScreen`'s fixed box
 * carries the wallpaper's tint (REQUIREMENTS.md § 12.2.), which the panel would
 * otherwise show through and lose its text against.
 */
export function SidePanel({ className, children }: SidePanelProps) {
  return (
    <aside
      className={cn(
        "hidden bg-canvas text-ink motion-reduce:transition-none lg:block lg:w-(--pane-width) lg:shrink-0 lg:overflow-hidden lg:border-r lg:border-hairline lg:transition-[width] lg:duration-(--duration-route-enter) lg:ease-route",
        className,
      )}
    >
      <div className="h-full w-(--pane-open-width) overflow-y-auto">{children}</div>
    </aside>
  );
}
