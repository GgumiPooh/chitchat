import { cn } from "@/shared/lib";
import type { ComponentProps, PropsWithChildren } from "react";
import { HapticTarget } from "./haptic-target";

export type HeaderTextButtonProps = PropsWithChildren<ComponentProps<"button">> & {
  className?: string;
  /** WARN: The button's own box, for anything `className` cannot reach once `haptic` moves that to the wrapper — padding, radius, colour. */
  buttonClassName?: string;
  haptic?: boolean;
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
  haptic = false,
  type = "button",
  ...props
}: HeaderTextButtonProps) {
  const button = (
    <button
      // WARN: `buttonClassName` applies in **both** branches, `Button`'s own reason — dropped under `haptic` alone, a caller loses the box (`rounded-full`, `text-primary`) rather than only the wrapper's own layout.
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-sm text-button-sm font-semibold text-primary transition-colors outline-none hover:bg-primary-tint focus-visible:ring-2 focus-visible:ring-primary active:bg-primary-tint/80",
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
