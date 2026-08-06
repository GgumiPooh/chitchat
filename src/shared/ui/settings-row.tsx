import { cn } from "@/shared/lib";
import { ChevronRight } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { HapticTap } from "./haptic-tap";

export type SettingsRowProps = {
  className?: string;
  labelClassName?: string;
  iconClassName?: string;
  label: string;
  description?: string;
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Rendered in the trailing slot in place of the chevron — a switch, a value, a spinner. */
  trailing?: ReactNode;
  /** Ticks the Taptic engine when a finger lands on the row. Ignored on a row with no `onClick`, which is not a target. */
  haptic?: boolean;
  onClick?: () => void;
};

/**
 * DESIGN.md § 7.11. One row of a settings list. It renders a `button` only when
 * it is actually actionable — a row whose whole job is to hold a switch must not
 * be a second, larger hit target that toggles nothing.
 */
export function SettingsRow({
  className,
  labelClassName,
  iconClassName,
  label,
  description,
  Icon,
  trailing,
  haptic = false,
  onClick,
}: SettingsRowProps) {
  const Tag = onClick ? "button" : "div";
  const hasHaptic = haptic && Boolean(onClick);

  const row = (
    <Tag
      className={cn(
        "flex min-h-14 w-full items-center gap-sm border-b border-hairline-soft bg-canvas p-md text-left transition-colors",
        onClick &&
          "cursor-pointer outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-strong",
        className,
      )}
      type={onClick ? "button" : undefined}
      onClick={onClick}
    >
      {Icon && <Icon className={cn("size-[18px] shrink-0 text-meta", iconClassName)} />}
      <span className="flex min-w-0 flex-1 flex-col gap-2xs">
        <span className={cn("text-title-md text-ink", labelClassName)}>{label}</span>
        {description && <span className="text-body-sm text-meta">{description}</span>}
      </span>
      {trailing ?? (onClick && <ChevronRight className="size-4 shrink-0 text-meta" />)}
    </Tag>
  );

  if (!hasHaptic) {
    return row;
  }

  return (
    // WARN: A sibling directly after the row, never a child. Inside a `<button>` WebKit ends the tap in the native control and no click reaches JS at all.
    <span className="group relative flex w-full">
      {row}
      {/* WARN: `keepsScroll` — the row runs edge to edge, so a finger scrolling the list lands here, and the switch would keep that drag and end it as a tap on the row (`DESIGN.md § 7.15.1.`). */}
      <HapticTap className="touch-pan-y" forwardsTap keepsScroll />
    </span>
  );
}
