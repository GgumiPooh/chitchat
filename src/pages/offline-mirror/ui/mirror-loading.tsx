import { cn } from "@/shared/lib";
import { Skeleton } from "@/shared/ui";

export type MirrorLoadingVariant = "rows" | "bubbles" | "calendar" | "grid" | "months";

export type MirrorLoadingProps = {
  className?: string;
  /** DESIGN.md § 7.8. The shape of the screen this stands in for — a fallback of the wrong shape moves the content twice. */
  variant?: MirrorLoadingVariant;
};

const ROW_KEYS = ["a", "b", "c", "d", "e"];
const WEEK_KEYS = ["a", "b", "c", "d", "e", "f"];
const DAY_KEYS = ["a", "b", "c", "d", "e", "f", "g"];
const TILE_KEYS = ["a", "b", "c", "d", "e", "f", "g", "h", "i"];
// INFO: Alternating sides and varying widths, so the plate reads as a conversation rather than as a list.
const BUBBLES: { key: string; isMine: boolean; width: string }[] = [
  { key: "a", isMine: false, width: "w-3/5" },
  { key: "b", isMine: true, width: "w-2/5" },
  { key: "c", isMine: true, width: "w-1/2" },
  { key: "d", isMine: false, width: "w-1/3" },
  { key: "e", isMine: false, width: "w-3/5" },
  { key: "f", isMine: true, width: "w-2/5" },
];

/** What a mirrored screen shows while its snapshot is being opened. */
export function MirrorLoading({ className, variant = "rows" }: MirrorLoadingProps) {
  return (
    <div className={cn("flex flex-col", className)} aria-hidden>
      {variant === "rows" && renderRows()}
      {variant === "bubbles" && renderBubbles()}
      {variant === "calendar" && renderCalendar()}
      {variant === "grid" && renderGrid()}
      {variant === "months" && renderMonths()}
    </div>
  );
}

function renderRows() {
  return (
    <div className="flex flex-col gap-sm">
      {ROW_KEYS.map((key) => (
        <Skeleton key={key} className="h-14 rounded-md" />
      ))}
    </div>
  );
}

function renderBubbles() {
  return (
    <div className="flex flex-col gap-sm px-md">
      {BUBBLES.map(({ key, isMine, width }) => (
        <Skeleton
          key={key}
          className={cn("h-10 rounded-bubble", width, isMine ? "self-end" : "self-start")}
        />
      ))}
    </div>
  );
}

// INFO: DESIGN.md § 7.9. The month title row, the weekday row and six weeks of day cells — `CalendarMonth`'s own frame.
function renderCalendar() {
  return (
    <div className="flex flex-col gap-sm">
      <div className="flex items-center justify-between px-xs">
        <Skeleton className="size-9 rounded-full" />
        <Skeleton className="h-[1lh] w-24 text-title-md" />
        <Skeleton className="size-9 rounded-full" />
      </div>
      <div className="grid grid-cols-7 gap-y-xs">
        {DAY_KEYS.map((key) => (
          <Skeleton key={key} className="mx-auto h-4 w-4 rounded-xs" />
        ))}
        {WEEK_KEYS.flatMap((week) =>
          DAY_KEYS.map((day) => (
            <Skeleton key={week + day} className="mx-auto size-9 rounded-full" />
          )),
        )}
      </div>
    </div>
  );
}

// INFO: REQUIREMENTS.md § 10. The month label placeholder as well as the tiles, for the reason `ArchiveGrid`'s own skeleton draws both.
function renderGrid() {
  return (
    <div className="flex flex-col">
      <Skeleton className="mb-xs h-5 w-24 rounded-xs" />
      <div className="grid grid-cols-3 gap-2xs">
        {TILE_KEYS.map((key) => (
          <Skeleton key={key} className="aspect-square rounded-sm" />
        ))}
      </div>
    </div>
  );
}

function renderMonths() {
  return (
    <div className="flex flex-col gap-2xs">
      {ROW_KEYS.map((key) => (
        <Skeleton key={key} className="h-8 rounded-md" />
      ))}
    </div>
  );
}
