import { cn } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";

export type MirrorLoadingProps = {
  className?: string;
};

// INFO: DESIGN.md § 7.8. The IndexedDB read is a frame or two, so this stands in for a shape rather than for a screen.
const ROW_KEYS = ["a", "b", "c", "d", "e"];

/** What a mirrored screen shows while its snapshot is being opened. */
export function MirrorLoading({ className }: MirrorLoadingProps) {
  return (
    <div className={cn("flex flex-col gap-sm p-md", className)} aria-hidden>
      {ROW_KEYS.map((key) => (
        <Skeleton key={key} className="h-14 rounded-md" />
      ))}
    </div>
  );
}
