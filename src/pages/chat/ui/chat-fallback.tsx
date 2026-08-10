import { cn } from "@/shared/lib";
import { AppHeader, Container, Skeleton } from "@/shared/ui";

/**
 * INFO: DESIGN.md § 6.3. The newest page as a shape — who sent what alternates, and a
 * run by one sender indents to the avatar column after its first row.
 *
 * INFO: Read bottom-up, because that is the edge the room opens on: the last entry is
 * the newest message and sits directly above the composer.
 */
const ROWS = [
  { key: "a", isMine: false, isFirstOfGroup: true, widthClassName: "w-44" },
  { key: "b", isMine: true, isFirstOfGroup: true, widthClassName: "w-32" },
  { key: "c", isMine: true, isFirstOfGroup: false, widthClassName: "w-24" },
  { key: "d", isMine: false, isFirstOfGroup: true, widthClassName: "w-52" },
  { key: "e", isMine: false, isFirstOfGroup: false, widthClassName: "w-28" },
  { key: "f", isMine: true, isFirstOfGroup: true, widthClassName: "w-40" },
];

// INFO: DESIGN.md § 6.2. A one-line bubble is its own line box plus `py-xs`, which is the height stated rather than measured.
const BUBBLE_CLASS_NAME = "h-[calc(1lh+var(--spacing-xs)*2)] rounded-bubble text-chat-body";

export type ChatFallbackProps = {
  className?: string;
};

/**
 * The fallback 채팅 streams behind.
 *
 * WARN: DESIGN.md § 3.4. It reproduces `ChatScreen`'s own `fixed` box rather than
 * sitting in the document like every other fallback here. That box is what leaves the
 * document nothing to pan under a keyboard, and a fallback in flow would grow the
 * shell column for as long as it is up — so the swap would land the room in a
 * document that had just been scrolled somewhere else.
 *
 * INFO: The wallpaper (REQUIREMENTS.md § 12.2.) is deliberately absent. Its tint is
 * seeded by the shell, which has not resolved yet wherever this is on screen, and a
 * flat `chat-canvas` is exactly what the room falls back to when there is none.
 */
export function ChatFallback({ className }: ChatFallbackProps) {
  return (
    <Container
      className={cn(
        "fixed inset-x-0 top-(--keyboard-pan) flex h-[var(--viewport-height,100dvh)] flex-col bg-chat-canvas px-0 shell-edge",
        className,
      )}
      aria-hidden
    >
      <AppHeader />
      {/* INFO: DESIGN.md § 6.1. Bottom-anchored, because the room opens on the newest message rather than the oldest. */}
      <div className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden pb-xs">
        {ROWS.map(({ key, widthClassName, isMine, isFirstOfGroup }) => (
          <div
            key={key}
            className={cn(
              "flex gap-xs px-md",
              isFirstOfGroup ? "pt-sm" : "pt-2xs",
              isMine && "justify-end",
            )}
          >
            {/* INFO: DESIGN.md § 6.3., § 7.7. The 36px chat avatar on the first row of a group, and the column it leaves behind on the rest. */}
            {!isMine &&
              (isFirstOfGroup ? (
                <Skeleton className="size-9 shrink-0 rounded-full" />
              ) : (
                <span className="size-9 shrink-0" />
              ))}
            <Skeleton className={cn(BUBBLE_CLASS_NAME, widthClassName)} />
          </div>
        ))}
      </div>
      {/* INFO: DESIGN.md § 6.6. The composer's own box, drawn for real — the glass pill, its gutters and its lift are all fixed geometry, so only the field and the send disc inside it stand in for anything. */}
      <div className="mb-(--bottom-inset) px-md pt-xs pb-xs">
        <div className="flex items-end gap-2xs rounded-[calc(var(--tab-bar-height)/2)] border border-hairline glass p-2xs shadow-floating">
          {/* INFO: 첨부, the field, 이모티콘 and 보내기 — four items at the 44px each of them occupies, so the pill resolves to exactly the height it will have. */}
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <Skeleton className="h-11 min-w-0 flex-1 rounded-md" />
          <Skeleton className="size-11 shrink-0 rounded-full" />
          <Skeleton className="size-11 shrink-0 rounded-full" />
        </div>
      </div>
    </Container>
  );
}
