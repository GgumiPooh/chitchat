import { cn } from "@/shared/lib";

export type SilentRingProps = {
  className?: string;
};

/**
 * REQUIREMENTS.md § 16.1. 조용히 보내기's dashed line on a bubble-less attachment —
 * `PrivateRing`'s layered-overlay construction for the reasons documented there,
 * dashed and in `bubble-silent-line` so the two modes read apart.
 */
export function SilentRing({ className }: SilentRingProps) {
  return (
    <span
      className={cn(
        "pointer-events-none absolute inset-0 border-[2px] border-dashed border-bubble-silent-line",
        className,
      )}
      aria-hidden
    />
  );
}
