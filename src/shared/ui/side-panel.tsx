import { APP_SHELL_ID, SIDE_PANEL_SETTLED_EVENT } from "@/shared/config";
import { cn, SIDE_PANEL_ANIMATING_ATTRIBUTE } from "@/shared/lib";
import type { PropsWithChildren, TransitionEvent } from "react";

export type SidePanelProps = PropsWithChildren<{
  className?: string;
}>;

// INFO: AGENTS.md § 4.4. Clears the animating flag `useSidePanel.set` raises, and wakes anything deferred through `onSidePanelSettled`.
function handleTransitionEnd(event: TransitionEvent<HTMLElement>) {
  if (event.propertyName !== "width") {
    return;
  }

  document.getElementById(APP_SHELL_ID)?.removeAttribute(SIDE_PANEL_ANIMATING_ATTRIBUTE);
  window.dispatchEvent(new Event(SIDE_PANEL_SETTLED_EVENT));
}

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
        "hidden bg-canvas text-ink motion-reduce:transition-none lg:block lg:w-(--pane-width) lg:shrink-0 lg:overflow-hidden lg:border-r lg:border-hairline lg:[#app-shell[data-side-panel-animating]_&]:transition-[width] lg:[#app-shell[data-side-panel-animating]_&]:duration-(--duration-route-enter) lg:[#app-shell[data-side-panel-animating]_&]:ease-route",
        className,
      )}
      onTransitionEnd={handleTransitionEnd}
    >
      <div className="flex h-full w-(--pane-open-width) flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </aside>
  );
}
