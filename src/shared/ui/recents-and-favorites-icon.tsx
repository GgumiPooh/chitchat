import { cn } from "@/shared/lib";
import { Clock, Star } from "lucide-react";

export type RecentsAndFavoritesIconProps = {
  className?: string;
};

export function RecentsAndFavoritesIcon({ className }: RecentsAndFavoritesIconProps) {
  return (
    <div className={cn("relative size-5 text-meta", className)}>
      {/* Top-left Clock */}
      <Clock className="absolute -top-1 -left-1 size-3.5" strokeWidth={1.75} />

      {/* Diagonal dividing line */}
      <svg
        className="pointer-events-none absolute inset-0 size-full stroke-current"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="3.5"
          y1="16.5"
          x2="16.5"
          y2="3.5"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity={0.35}
        />
      </svg>

      {/* Bottom-right Star */}
      <Star className="absolute -right-1 -bottom-1 size-3.5" strokeWidth={1.75} />
    </div>
  );
}
