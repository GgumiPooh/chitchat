import { cn } from "@/shared/lib";
import { HapticTarget } from "@/shared/ui";
import { Bookmark } from "lucide-react";

export type BookmarkCornerButtonProps = {
  className?: string;
  disabled?: boolean;
  onClick: () => void;
};

/**
 * DESIGN.md § 6.8.1. Rides the composer's top-right corner at the § 6.7. pill's
 * rest geometry — a shortcut to the § 8.19. list while a search is not open.
 */
export function BookmarkCornerButton({
  className,
  disabled = false,
  onClick,
}: BookmarkCornerButtonProps) {
  return (
    <HapticTarget
      className={cn("inline-flex shrink-0", className)}
      inert={disabled}
      isTicking={!disabled}
    >
      <button
        className="inline-flex min-h-10 min-w-10 press-bloom cursor-pointer items-center justify-center rounded-full border border-hairline bg-canvas p-2 shadow-raised transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary disabled:pointer-events-none disabled:cursor-not-allowed"
        type="button"
        disabled={disabled}
        aria-label="책갈피 목록"
        onClick={onClick}
      >
        <Bookmark className="size-4 text-meta" strokeWidth={1.75} />
      </button>
    </HapticTarget>
  );
}
