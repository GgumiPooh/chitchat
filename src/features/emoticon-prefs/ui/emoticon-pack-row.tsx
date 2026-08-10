"use client";

import type { EmoticonPackSummary } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { HapticTarget, IconButton, PreloadImage } from "@/shared/ui";
import { useSortable } from "@dnd-kit/sortable";
import { ChevronRight, GripVertical, MoreVertical, Smile } from "lucide-react";
import type { TransitionEvent } from "react";
import { EMOTICON_PACK_ROW_HEIGHT_CLASS } from "../model/pack-row-height";

export type EmoticonPackRowProps = {
  className?: string;
  pack: EmoticonPackSummary;
  /** REQUIREMENTS.md § 13.5. 숨기기 has been asked for and the row is collapsing; the removal is committed when it lands. */
  isHiding: boolean;
  onOpen: (packId: string) => void;
  /** REQUIREMENTS.md § 13.5. 이름 바꾸기 / 숨기기 / 삭제 — the sheet, not a control of its own. */
  onManage: (packId: string) => void;
  onHidden: (packId: string) => void;
};

/**
 * One row of the § 13.5. 사용중 list.
 *
 * WARN: The drag listeners go on the handle, not the row. On the row they would
 * swallow the other controls' pointer events, and `TouchSensor` needs `touch-none` on
 * whatever it listens to — applying that to the row would stop the list scrolling.
 *
 * WARN: `MoreVertical` and never a hamburger. Beside a real drag handle, `☰` is the
 * grip idiom twice over and the two cannot be told apart by the thumb that has to
 * choose between them.
 */
export function EmoticonPackRow({
  className,
  pack,
  isHiding,
  onOpen,
  onManage,
  onHidden,
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
        // INFO: DESIGN.md § 4.5. The lifted row is the one moment a list row may carry a shadow — it is genuinely floating above the others.
        isDragging && "relative z-10 shadow-raised",
        className,
      )}
      // INFO: Only the Y term is read, because `restrictToVerticalAxis` pins X at 0 — which is also why `@dnd-kit/utilities`' `CSS.Transform` is not worth a direct dependency here.
      // WARN: `transition` is `@dnd-kit`'s own and belongs to this element alone. On the strip below it would win over the height transition as an inline property and the collapse would simply cut.
      style={{
        transform: transform ? `translate3d(0, ${transform.y}px, 0)` : undefined,
        transition,
      }}
    >
      {/* WARN: DESIGN.md § 6.6. A real `height` and never a `0fr`→`1fr` grid track, for the reason the emoticon strip carries: mid-transition Chrome sizes such a track's container taller than the track it resolved. */}
      {/* WARN: The clip is its own element because the row is padded — `height: 0` on a `border-box` element with padding still occupies the padding, so the row would collapse to 17px and stop. */}
      <div
        className={cn(
          "overflow-hidden transition-[height] duration-200 ease-out",
          isHiding ? "h-0" : EMOTICON_PACK_ROW_HEIGHT_CLASS,
        )}
        onTransitionEnd={commitHide}
      >
        <div
          className={cn(
            "flex items-center gap-sm border-b border-hairline-soft bg-canvas px-md py-xs",
            EMOTICON_PACK_ROW_HEIGHT_CLASS,
          )}
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
          {/* WARN: `keepsScroll` — the name fills the row, so a finger scrolling the list lands here, and the switch would keep that drag and end it as a tap on the pack (`DESIGN.md § 7.15.1.`). */}
          <HapticTarget className="flex min-w-0 flex-1" overlayClassName="touch-pan-y" keepsScroll>
            <button
              className="flex min-w-0 flex-1 items-center gap-2xs rounded-sm px-2xs text-left group-active:bg-surface-strong hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:bg-surface-strong"
              type="button"
              onClick={() => onOpen(pack.id)}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-title-md text-ink">{pack.name}</span>
                <span className="block text-body-sm text-meta">{pack.itemCount}개</span>
              </span>
              <ChevronRight className="size-4 shrink-0 text-meta-soft" strokeWidth={1.75} />
            </button>
          </HapticTarget>
          <IconButton
            Icon={MoreVertical}
            haptic
            aria-label={`${pack.name} 관리`}
            onClick={() => onManage(pack.id)}
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
      </div>
    </div>
  );

  /**
   * WARN: Gated on `isHiding`, because the *expansion* ends here too — a write that
   * failed puts the row back, and reading that landing as the collapse would drop the
   * row this screen has just restored.
   */
  function commitHide(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== "height" || !isHiding) {
      return;
    }

    onHidden(pack.id);
  }
}
