import { cn, type Nullable } from "@/shared/lib";

export type EventMemoProps = {
  className?: string;
  description: Nullable<string>;
};

/**
 * DESIGN.md § 7.9. REQUIREMENTS.md § 11.4.'s memo on the list row, where it used to be
 * readable only from inside the edit form.
 */
export function EventMemo({ className, description }: EventMemoProps) {
  const memo = description?.trim();

  if (!memo) {
    return null;
  }

  // INFO: Three lines and no more — the row opens `EventDetailDialog`, which is where the memo is read in full (REQUIREMENTS.md § 11.4.). `whitespace-pre-line` because the breaks are the writer's own.
  // WARN: No `block` beside the clamp, and it is not redundant tidying. `line-clamp-3` **is** a display utility (`-webkit-box`), Tailwind emits `.block` after it, and the later rule wins whatever order the class string is written in — so the pair silently ships as an unclamped memo.
  return (
    <span
      className={cn(
        "mt-2xs line-clamp-3 text-caption whitespace-pre-line text-meta-soft",
        className,
      )}
    >
      {memo}
    </span>
  );
}
