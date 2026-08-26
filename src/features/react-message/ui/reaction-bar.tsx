"use client";

import { cn } from "@/shared/lib";
import { HapticTap } from "@/shared/ui";
import { Plus } from "lucide-react";
import { QUICK_REACTION_EMOJIS } from "../config/default-emojis";

export type ReactionBarProps = {
  className?: string;
  activeEmojis?: string[] | Set<string> | null;
  onSelectEmoji: (emoji: string) => void;
  onOpenMiniSheet: () => void;
};

export function ReactionBar({
  className,
  activeEmojis,
  onSelectEmoji,
  onOpenMiniSheet,
}: ReactionBarProps) {
  const activeSet =
    activeEmojis instanceof Set
      ? activeEmojis
      : Array.isArray(activeEmojis)
        ? new Set(activeEmojis)
        : null;

  return (
    <div
      className={cn(
        "flex w-full items-center justify-between rounded-2xl border border-hairline bg-canvas p-1.5 shadow-floating",
        className,
      )}
      role="toolbar"
      aria-label="리액션"
    >
      <div className="flex flex-1 items-center justify-around">
        {QUICK_REACTION_EMOJIS.map((emoji) => {
          const isSelected = activeSet?.has(emoji) ?? false;

          return (
            <button
              key={emoji}
              className={cn(
                "relative flex size-8.5 items-center justify-center rounded-full text-lg transition-all duration-150 active:scale-90",
                isSelected
                  ? "scale-105 bg-primary/20 ring-2 ring-primary"
                  : "hover:bg-surface-soft active:bg-surface-pressed",
              )}
              type="button"
              aria-label={emoji}
              aria-pressed={isSelected}
              onClick={() => onSelectEmoji(emoji)}
            >
              <span>{emoji}</span>
              <HapticTap forwardsTap />
            </button>
          );
        })}
      </div>

      <div className="mx-1 h-5 w-px shrink-0 bg-hairline" />

      <button
        className="relative flex size-8.5 shrink-0 items-center justify-center rounded-full bg-surface-soft text-ink transition-all duration-150 hover:bg-surface-strong active:scale-90 active:bg-surface-pressed"
        type="button"
        aria-label="미니이모티콘 더보기"
        onClick={onOpenMiniSheet}
      >
        <Plus className="size-4.5" strokeWidth={2.25} />
        <HapticTap forwardsTap />
      </button>
    </div>
  );
}
