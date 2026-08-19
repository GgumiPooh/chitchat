import { cn } from "@/shared/lib";
import type { ComponentProps } from "react";

export type ReorderHandleIconProps = ComponentProps<"svg"> & {
  className?: string;
};

/**
 * Mobile messenger-style reorder/drag handle icon (▲ ≡ ▼).
 * INFO: Matches lucide-react line style with rounded joints/caps.
 */
export function ReorderHandleIcon({
  className,
  strokeWidth = 1.75,
  ...props
}: ReorderHandleIconProps) {
  return (
    <svg
      className={cn("size-6", className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      {...props}
    >
      <path d="M4.5 10H19.5M4.5 14H19.5M9 4.7L12 1.7L15 4.7M9 19.3L12 22.3L15 19.3" />
    </svg>
  );
}
