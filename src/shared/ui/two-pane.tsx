import { cn, type Nullable } from "@/shared/lib";
import type { PropsWithChildren, ReactNode, RefObject } from "react";
import { SidePanel } from "./side-panel";

export type TwoPaneProps = PropsWithChildren<{
  className?: string;
  panelClassName?: string;
  panelScrollerRef?: RefObject<Nullable<HTMLDivElement>>;
  panel: ReactNode;
}>;

// WARN: The panel yields `--bottom-inset` — `RouteTransition` trails that much under every screen, and a full-`dvh` panel plus it is a document 4px taller than the viewport, which scrolls.
// INFO: AGENTS.md § 4.1. Stacks below `lg`; at `lg` the panel becomes a sticky, collapsible left column beside the main content. Sticky relies on the shell column carrying no `overflow` of its own (AGENTS.md § 4.4.).
export function TwoPane({
  className,
  panelClassName,
  panelScrollerRef,
  panel,
  children,
}: TwoPaneProps) {
  return (
    <div className={cn("flex flex-1 flex-col lg:flex-row", className)}>
      <SidePanel
        className={cn("lg:sticky lg:top-0 lg:h-[calc(100dvh-var(--bottom-inset))]", panelClassName)}
        scrollerRef={panelScrollerRef}
      >
        {panel}
      </SidePanel>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
