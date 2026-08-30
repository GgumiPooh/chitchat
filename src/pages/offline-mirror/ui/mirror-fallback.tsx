import { cn, type Optional } from "@/shared/lib";
import { AppHeader, Container, TwoPane } from "@/shared/ui";
import type { MirrorScreen } from "@/widgets/offline-shell";
import { MirrorLoading, type MirrorLoadingVariant } from "./mirror-loading";

export type MirrorFallbackProps = {
  className?: string;
  /** `undefined` before hydration, when the path — and so the screen — is not yet known. */
  screen: Optional<MirrorScreen>;
};

type Frame = {
  containerClassName: string;
  title?: string;
  variant: MirrorLoadingVariant;
  panelVariant?: MirrorLoadingVariant;
  isFullWidth?: boolean;
};

// INFO: DESIGN.md § 7.8. Each frame is the screen's own header, its own header inset and, at `lg`, its own panel — so the snapshot arriving changes what is drawn, never where.
const FRAMES: Record<MirrorScreen, Frame> = {
  chat: {
    variant: "bubbles",
    panelVariant: "rows",
    containerClassName: "px-0 pt-[calc(var(--app-header-inset)+var(--spacing-xs))]",
  },
  calendar: {
    title: "캘린더",
    variant: "rows",
    panelVariant: "calendar",
    containerClassName: "pt-[calc(var(--app-header-inset)+var(--spacing-md))]",
  },
  gallery: {
    title: "보관함",
    variant: "grid",
    panelVariant: "months",
    containerClassName: "max-w-none px-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]",
    isFullWidth: true,
  },
  files: {
    title: "보관함",
    variant: "rows",
    panelVariant: "months",
    containerClassName: "max-w-none px-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]",
    isFullWidth: true,
  },
  voice: {
    title: "보관함",
    variant: "rows",
    panelVariant: "months",
    containerClassName: "max-w-none px-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))]",
    isFullWidth: true,
  },
  settings: {
    title: "설정",
    variant: "rows",
    containerClassName: "pt-[calc(var(--app-header-inset)+var(--spacing-md))]",
  },
};

/**
 * What the mirror draws before it can draw a screen — the shell snapshot still
 * opening, or hydration not yet over — in that screen's own frame.
 */
export function MirrorFallback({ className, screen }: MirrorFallbackProps) {
  const frame = screen === undefined ? FRAMES.settings : FRAMES[screen];

  if (frame.panelVariant === undefined) {
    return (
      <div className={cn("flex flex-1 flex-col", className)}>
        <AppHeader title={screen === undefined ? undefined : frame.title} />
        <Container className={frame.containerClassName}>
          <MirrorLoading variant={frame.variant} />
        </Container>
      </div>
    );
  }

  return (
    <TwoPane
      className={className}
      panel={
        <div className="p-md">
          <MirrorLoading variant={frame.panelVariant} />
        </div>
      }
    >
      <AppHeader
        containerClassName={frame.isFullWidth ? "max-w-none" : undefined}
        hasSidePanel
        title={frame.title}
      />
      <Container className={frame.containerClassName}>
        <MirrorLoading variant={frame.variant} />
      </Container>
    </TwoPane>
  );
}
