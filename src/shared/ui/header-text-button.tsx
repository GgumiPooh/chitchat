import { cn } from "@/shared/lib";
import type { ComponentProps, PropsWithChildren } from "react";
import { HapticTarget } from "./haptic-target";

export type HeaderTextButtonProps = PropsWithChildren<ComponentProps<"button">> & {
  className?: string;
  /** WARN: The button's own box, for anything `className` cannot reach once `haptic` moves that to the wrapper — padding, radius, colour. */
  buttonClassName?: string;
  /** DESIGN.md § 7.12. `floating` carries the same glass surface as `icon-button-floating`, since the header itself is invisible; `plain` is for a sheet's own header row, which has a surface already. */
  variant?: "plain" | "floating";
  haptic?: boolean;
};

const VARIANT_CLASS_NAME: Record<NonNullable<HeaderTextButtonProps["variant"]>, string> = {
  plain: "hover:bg-primary-tint active:bg-primary-tint/80 group-active:bg-primary-tint/80",
  floating:
    "glass border border-hairline shadow-floating hover:bg-canvas active:bg-surface-soft group-active:bg-surface-soft",
};

/**
 * DESIGN.md § 7.12. The one style every text-label control in an `AppHeader`
 * takes — 검색's own 취소 and AI 질문 모드's `전체 해제`/`자동 선택` toggle —
 * kept in one place so the two cannot drift the way two hand-written class
 * strings already had.
 */
export function HeaderTextButton({
  className,
  buttonClassName,
  variant = "floating",
  haptic = false,
  type = "button",
  ...props
}: HeaderTextButtonProps) {
  const button = (
    <button
      // WARN: `buttonClassName` applies in **both** branches, `Button`'s own reason — dropped under `haptic` alone, a caller loses the box (`rounded-full`, `text-primary`) rather than only the wrapper's own layout.
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-sm text-button-sm font-semibold text-primary transition-colors outline-none focus-visible:ring-2 focus-visible:ring-primary",
        VARIANT_CLASS_NAME[variant],
        !haptic && className,
        buttonClassName,
      )}
      type={type}
      {...props}
    />
  );

  if (!haptic) {
    return button;
  }

  return <HapticTarget className={cn("inline-flex shrink-0", className)}>{button}</HapticTarget>;
}
