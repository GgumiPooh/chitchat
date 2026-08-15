import { cn } from "@/shared/lib";
import { RelativeTime } from "@/shared/ui";

export type SnapshotStampProps = {
  className?: string;
  savedAt: number;
};

/**
 * When the screen below this was last received (REQUIREMENTS.md § 16.).
 *
 * INFO: Particle-free by design — `기준` follows the interpolated relative time, so
 * nothing here can be caught out by a value ending in a vowel (AGENTS.md § 0.4.).
 */
export function SnapshotStamp({ className, savedAt }: SnapshotStampProps) {
  return (
    <p className={cn("text-caption text-meta", className)}>
      <RelativeTime date={savedAt} /> 기준
    </p>
  );
}
