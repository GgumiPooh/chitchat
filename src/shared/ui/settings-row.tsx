import { cn } from "@/shared/lib";
import { OFFLINE_NOTICE_ID } from "@/shared/offline-ux";
import { ChevronRight, CloudOff } from "lucide-react";
import type { ComponentType, ReactNode, SVGProps } from "react";
import { HapticTarget } from "./haptic-target";

export type SettingsRowProps = {
  className?: string;
  /** WARN: The row's own box, for anything `className` cannot reach once `haptic` moves that to the wrapper — padding, borders, colour. */
  rowClassName?: string;
  labelClassName?: string;
  iconClassName?: string;
  label: string;
  description?: string;
  Icon?: ComponentType<SVGProps<SVGSVGElement>>;
  /** Rendered in the trailing slot in place of the chevron — a switch, a value, a spinner. */
  trailing?: ReactNode;
  /** Ticks the Taptic engine when a finger lands on the row. Ignored on a row with no `onClick`, which is not a target. */
  haptic?: boolean;
  /** WARN: Wears the refusal only. Suppressing the tap is the caller's, through `useOfflineGate`'s `guard` — `aria-disabled` stops nothing on its own. */
  isUnavailable?: boolean;
  onClick?: () => void;
};

/**
 * DESIGN.md § 7.11. One row of a settings list. It renders a `button` only when
 * it is actually actionable — a row whose whole job is to hold a switch must not
 * be a second, larger hit target that toggles nothing.
 *
 * WARN: With `haptic` on an actionable row, `className` lands on the wrapper rather
 * than the row — the wrapper is what the list lays out. Anything about the row's own
 * box goes to `rowClassName`.
 */
export function SettingsRow({
  className,
  rowClassName,
  labelClassName,
  iconClassName,
  label,
  description,
  Icon,
  trailing,
  haptic = false,
  isUnavailable = false,
  onClick,
}: SettingsRowProps) {
  const Tag = onClick ? "button" : "div";
  // INFO: A row that refuses confirms nothing, so it must not tick either.
  const hasHaptic = haptic && Boolean(onClick) && !isUnavailable;

  const row = (
    <Tag
      className={cn(
        "flex min-h-14 w-full items-center gap-sm border-b border-hairline-soft bg-canvas p-md text-left transition-colors",
        onClick &&
          "cursor-pointer outline-none group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset active:bg-surface-strong",
        // WARN: `rowClassName` applies in **both** branches — see `Button`. `hasHaptic` falls with `isUnavailable`, so a row styled through it lost its own box the moment it started refusing.
        !hasHaptic && className,
        rowClassName,
      )}
      type={onClick ? "button" : undefined}
      aria-disabled={isUnavailable || undefined}
      aria-describedby={isUnavailable ? OFFLINE_NOTICE_ID : undefined}
      onClick={onClick}
    >
      {Icon && <Icon className={cn("size-[18px] shrink-0 text-meta", iconClassName)} />}
      <span className="flex min-w-0 flex-1 flex-col gap-2xs">
        {/* WARN: A token rather than an opacity wash. `aria-disabled` keeps the contrast floor the `disabled` attribute is exempt from, and `meta` is the dimmest tone that still clears it. */}
        <span
          className={cn("text-title-md", isUnavailable ? "text-meta" : "text-ink", labelClassName)}
        >
          {label}
        </span>
        {description && <span className="text-body-sm text-meta">{description}</span>}
      </span>
      {trailing}
      {/* INFO: The chevron promises a screen this tap cannot reach, so the glyph says which of the two it is instead. */}
      {/* WARN: The refusal glyph rides **beside** `trailing` rather than being replaced by it. A row that carries its own trailing — § 12.2.'s wallpaper thumbnail — is still a row that refuses, and suppressing it there took the only visible mark of that away from exactly the readers who have a background set. */}
      {onClick &&
        (isUnavailable ? (
          <CloudOff className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
        ) : (
          !trailing && <ChevronRight className="size-4 shrink-0 text-meta" />
        ))}
    </Tag>
  );

  if (!hasHaptic) {
    return row;
  }

  return (
    // WARN: `keepsScroll` — the row runs edge to edge, so a finger scrolling the list lands here, and the switch would keep that drag and end it as a tap on the row (`DESIGN.md § 7.15.1.`).
    <HapticTarget
      className={cn("flex w-full", className)}
      overlayClassName="touch-pan-y"
      keepsScroll
    >
      {row}
    </HapticTarget>
  );
}
