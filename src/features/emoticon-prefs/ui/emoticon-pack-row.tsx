"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { IconButton, PreloadImage, Switch } from "@/shared/ui";
import { useSortable } from "@dnd-kit/sortable";
import { ChevronRight, GripVertical, Settings2, Smile } from "lucide-react";

export type EmoticonPackRowProps = {
  className?: string;
  pack: EmoticonPackSummary;
  onOpen: (packId: string) => void;
  /** REQUIREMENTS.md § 13.5. Rename and delete — the pack itself, unlike the switch beside it, which is this user's own view of it. */
  onManage: (packId: string) => void;
  onToggle: (packId: string, isEnabled: boolean) => void;
};

/**
 * One row of the § 13.5. management list.
 *
 * WARN: The drag listeners go on the handle, not the row. On the row they would
 * swallow the switch's own pointer events, and `TouchSensor` needs `touch-none` on
 * whatever it listens to — applying that to the row would stop the list scrolling.
 */
export function EmoticonPackRow({
  className,
  pack,
  onOpen,
  onManage,
  onToggle,
}: EmoticonPackRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: pack.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-14 items-center gap-sm border-b border-hairline-soft bg-canvas px-md py-xs",
        // INFO: DESIGN.md § 4.5. The lifted row is the one moment a list row may carry a shadow — it is genuinely floating above the others.
        isDragging && "relative z-10 shadow-raised",
        className,
      )}
      // INFO: Only the Y term is read, because `restrictToVerticalAxis` pins X at 0 — which is also why `@dnd-kit/utilities`' `CSS.Transform` is not worth a direct dependency here.
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      <div className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-soft ring-1 ring-hairline ring-inset">
        {pack.thumbnailItemId ? (
          <PreloadImage
            className="size-full"
            imgClassName="size-full object-contain"
            alt=""
            src={toEmoticonAssetUrl(
              pack.thumbnailItemId,
              "image",
              pack.thumbnailVersion ?? undefined,
            )}
          />
        ) : (
          <Smile className="size-5 text-meta-soft" strokeWidth={1.75} />
        )}
      </div>
      {/* INFO: The chevron is the affordance — without it nothing says the name is a link to the pack's own screen rather than a label. */}
      <button
        className="flex min-w-0 flex-1 items-center gap-2xs rounded-sm px-2xs py-2xs text-left hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
        type="button"
        onClick={() => onOpen(pack.id)}
      >
        <span className="min-w-0 flex-1">
          <span
            className={cn("block truncate text-title-md text-ink", !pack.isEnabled && "text-meta")}
          >
            {pack.name}
          </span>
          <span className="block text-body-sm text-meta">{pack.itemCount}개</span>
        </span>
        <ChevronRight className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
      </button>
      <IconButton
        Icon={Settings2}
        aria-label={`${pack.name} 관리`}
        onClick={() => onManage(pack.id)}
      />
      <Switch
        checked={pack.isEnabled}
        aria-label={`${pack.name} 사용`}
        onCheckedChange={(checked) => onToggle(pack.id, checked)}
      />
      <button
        ref={setActivatorNodeRef}
        className="flex size-11 shrink-0 touch-none items-center justify-center rounded-full text-meta hover:bg-surface-soft hover:text-ink focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
        type="button"
        aria-label={`${pack.name} 순서 변경`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-5" strokeWidth={1.75} />
      </button>
    </div>
  );
}
