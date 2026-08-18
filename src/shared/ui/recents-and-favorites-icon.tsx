import { cn } from "@/shared/lib";
import { Clock, Star } from "lucide-react";

export type RecentsAndFavoritesIconProps = {
  className?: string;
};

export function RecentsAndFavoritesIcon({ className }: RecentsAndFavoritesIconProps) {
  return (
    <div className={cn("relative size-5 text-meta", className)}>
      {/* Top-left Clock */}
      <Clock className="absolute -top-0.5 -left-0.5 size-3" strokeWidth={2} />

      {/* Diagonal dividing line */}
      <svg
        className="pointer-events-none absolute inset-0 size-full stroke-current"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <line
          x1="5"
          y1="15"
          x2="15"
          y2="5"
          strokeWidth="1.25"
          strokeLinecap="round"
          opacity={0.6}
        />
      </svg>

      {/* Bottom-right Star */}
      <Star className="absolute -right-0.5 -bottom-0.5 size-3" strokeWidth={2} />
    </div>
  );
}
