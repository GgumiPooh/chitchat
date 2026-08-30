"use client";

import type { MessageReaction } from "@/entities/message";
import { toEmoticonAssetUrl } from "@/shared/config";
import {
  cn,
  MINI_ANIMATION_LOOP_INTERVAL,
  toPreviousReplaySrc,
  toReplaySrc,
  useViewportReplay,
  type EmoticonItemId,
  type UserId,
} from "@/shared/lib";
import { HapticTarget, PreloadImage } from "@/shared/ui";

export type ReactionBadgesProps = {
  className?: string;
  reactions: MessageReaction[];
  currentUserId: UserId;
  onToggleReaction: (
    reaction:
      | { reactionType: "emoji"; emoji: string }
      | { reactionType: "emoticon"; emoticonItemId: EmoticonItemId },
  ) => void;
};

type ReactionGroup = {
  key: string;
  reactionType: "emoji" | "emoticon";
  emoji?: string;
  emoticonItemId?: EmoticonItemId;
  count: number;
  hasMine: boolean;
};

export function ReactionBadges({
  className,
  reactions,
  currentUserId,
  onToggleReaction,
}: ReactionBadgesProps) {
  if (!reactions || reactions.length === 0) {
    return null;
  }

  const groupMap = new Map<string, ReactionGroup>();

  for (const reaction of reactions) {
    const key =
      reaction.reactionType === "emoji"
        ? `emoji:${reaction.emoji}`
        : `emoticon:${reaction.emoticonItemId}`;

    const existing = groupMap.get(key);
    const isMine = reaction.userId === currentUserId;

    if (existing) {
      existing.count += 1;
      if (isMine) {
        existing.hasMine = true;
      }
    } else {
      groupMap.set(key, {
        key,
        reactionType: reaction.reactionType,
        emoji: reaction.emoji ?? undefined,
        emoticonItemId: reaction.emoticonItemId ?? undefined,
        count: 1,
        hasMine: isMine,
      });
    }
  }

  const groups = Array.from(groupMap.values());

  return (
    <div className={cn("mt-0.5 flex flex-wrap items-center gap-1", className)}>
      {groups.map((group) => {
        const handleClick = () => {
          if (group.reactionType === "emoji" && group.emoji) {
            onToggleReaction({ reactionType: "emoji", emoji: group.emoji });
          } else if (group.reactionType === "emoticon" && group.emoticonItemId) {
            onToggleReaction({
              reactionType: "emoticon",
              emoticonItemId: group.emoticonItemId,
            });
          }
        };

        return (
          // WARN: `keepsScroll` — the badges sit inside the chat scroller, so the switch would keep a drag that began on one and the room would not scroll at all (`DESIGN.md § 7.15.1.`).
          <HapticTarget
            key={group.key}
            className="inline-flex shrink-0"
            overlayClassName="touch-pan-y"
            keepsScroll
          >
            <button
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2 py-0 font-medium shadow-2xs backdrop-blur-md transition-all active:scale-95",
                group.hasMine
                  ? "border-primary/50 bg-surface-soft/60 text-primary hover:bg-surface-soft/80 dark:border-primary/60 dark:bg-surface-soft/60 dark:text-primary dark:hover:bg-surface-soft/80"
                  : "border-hairline bg-surface-soft/60 text-ink hover:bg-surface-soft/80",
              )}
              type="button"
              aria-label={`리액션 ${group.count}개`}
              onClick={handleClick}
            >
              {group.reactionType === "emoji" ? (
                <span className="text-sm leading-none">{group.emoji}</span>
              ) : group.emoticonItemId ? (
                <BadgeEmoticonImage itemId={group.emoticonItemId} />
              ) : null}
              {group.count > 0 && (
                <span className="text-[11px] leading-none font-semibold tabular-nums">
                  {group.count}
                </span>
              )}
            </button>
          </HapticTarget>
        );
      })}
    </div>
  );
}

function BadgeEmoticonImage({ itemId }: { itemId: EmoticonItemId }) {
  const { ref: replayRef, replayToken } = useViewportReplay(MINI_ANIMATION_LOOP_INTERVAL);
  const emoticonAssetUrl = toEmoticonAssetUrl(itemId, "animated-image");

  return (
    <span ref={replayRef} className="inline-block size-5 shrink-0 overflow-hidden">
      <PreloadImage
        key={replayToken}
        className="size-full"
        imgClassName="size-full object-contain"
        placeholderClassName="rounded-none"
        alt=""
        previewSrc={toPreviousReplaySrc(emoticonAssetUrl, replayToken)}
        hidesPreviewOnReveal
        loading={replayToken > 0 ? "eager" : "lazy"}
        draggable={false}
        src={toReplaySrc(emoticonAssetUrl, replayToken)}
      />
    </span>
  );
}
