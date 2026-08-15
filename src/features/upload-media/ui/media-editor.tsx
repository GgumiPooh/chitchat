"use client";

import type { MediaDraft } from "@/entities/media";
import { cn, type Nullable } from "@/shared/lib";
import { Button, Chip, IconButton, ShellOverlay, toast } from "@/shared/ui";
import { X } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { Cropper, type CropperRef } from "react-advanced-cropper";
import "react-advanced-cropper/dist/style.css";
import { applyEdit, type ApplyEditOptions, type CropArea } from "../model/apply-edit";
import { DEFAULT_FILTER, MEDIA_FILTERS, type MediaFilter } from "../model/filters";

// INFO: `free` is the default because a crop the user drew themselves is the one no ratio here can express; the fixed ratios stay for the common framings.
const ASPECT_OPTIONS = [
  { id: "free", label: "자유", ratio: undefined },
  { id: "original", label: "원본", ratio: null },
  { id: "square", label: "1:1", ratio: 1 },
  { id: "portrait", label: "4:5", ratio: 4 / 5 },
  { id: "landscape", label: "16:9", ratio: 16 / 9 },
] as const;

export type MediaEditorProps = {
  className?: string;
  draft: MediaDraft;
  // INFO: REQUIREMENTS.md § 13.4. The emoticon flow passes `image/png` so the crop keeps its alpha, and its own smaller `maxEdge`.
  editOptions?: ApplyEditOptions;
  /**
   * Locks the crop to one ratio and drops the ratio chips with it.
   *
   * INFO: REQUIREMENTS.md § 12. The avatar flow passes `1`, because a circle
   * (DESIGN.md § 7.7.) crops anything else on its own — and then the § 7.10.
   * viewer would show a framing the circle never did.
   */
  fixedAspectRatio?: number;
  onCancel: () => void;
  onDone: (draft: MediaDraft) => void;
};

/**
 * Crop and filter, over the chat surface. The crop box is resizable by its own
 * handles, so `자유` is a real free-form crop rather than another fixed ratio.
 *
 * WARN: `absolute`, never `fixed` — `ShellOverlay` owns the viewport-sized box this
 * fills (DESIGN.md § 3.3.), rather than the chat room: staying inside the screen
 * leaves it under the floating header and the tab bar.
 */
export function MediaEditor({
  className,
  draft,
  editOptions,
  fixedAspectRatio,
  onCancel,
  onDone,
}: MediaEditorProps) {
  const [aspectId, setAspectId] = useState<string>("free");
  const [filter, setFilter] = useState<MediaFilter>(DEFAULT_FILTER);
  const [croppedArea, setCroppedArea] = useState<Nullable<CropArea>>(null);
  const [isSaving, setIsSaving] = useState(false);
  // INFO: `draft.previewUrl` is the thumbnail's blob, so the cropper needs a URL for the original of its own. Empty until the effect below mints one.
  const [sourceUrl, setSourceUrl] = useState("");
  const selected = ASPECT_OPTIONS.find((option) => option.id === aspectId);
  const aspectRatio =
    fixedAspectRatio ?? (selected?.ratio === null ? draft.width / draft.height : selected?.ratio);

  // WARN: Created and revoked inside one effect, never from a `useState` initializer. StrictMode runs setup → cleanup → setup on mount, and state survives that cycle: a URL minted during render would be revoked by the first cleanup and the cropper would then point at a dead blob for the rest of the edit.
  useEffect(() => {
    const url = URL.createObjectURL(draft.file);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state; minting it and handing it to React is this effect's whole purpose.
    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [draft.file]);

  return (
    <ShellOverlay>
      <div
        className={cn(
          "pointer-events-auto absolute inset-0 z-50 flex flex-col bg-scrim",
          className,
        )}
      >
        <div className="flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-scrim hover:bg-on-scrim/15 hover:text-on-scrim"
            Icon={X}
            aria-label="편집 취소"
            onClick={onCancel}
          />
          <Button
            className="w-auto"
            buttonClassName="h-11 min-h-11 w-auto px-md"
            disabled={isSaving}
            haptic
            onClick={() => void save()}
          >
            완료
          </Button>
        </div>
        {/* INFO: The filter is a preview only — `applyEdit` bakes the same value into the canvas — so it rides a variable the cropper's own `<img>` inherits rather than a prop the library does not expose. */}
        <div
          className="relative min-h-0 flex-1 [&_img]:[filter:var(--media-filter)]"
          style={{ "--media-filter": filter.value } as CSSProperties}
        >
          {/* INFO: The cropper measures and loads on mount, so it waits for a real `src` rather than mounting against an empty one. */}
          {sourceUrl && (
            <Cropper
              // WARN: Keyed by the ratio — the stencil reads `aspectRatio` when it initializes, so switching chips has to remount it or the box keeps the previous ratio.
              key={aspectId}
              className="size-full"
              src={sourceUrl}
              stencilProps={{ aspectRatio, grid: true }}
              onChange={handleChange}
            />
          )}
        </div>
        <div className="space-y-xs p-sm pb-[max(var(--spacing-sm),env(safe-area-inset-bottom))]">
          {fixedAspectRatio === undefined && (
            <div className="scrollbar-hidden flex touch-pan-x gap-2xs overflow-x-auto overscroll-contain">
              {ASPECT_OPTIONS.map((option) => (
                <Chip
                  key={option.id}
                  isSelected={option.id === aspectId}
                  onClick={() => setAspectId(option.id)}
                >
                  {option.label}
                </Chip>
              ))}
            </div>
          )}
          <div className="scrollbar-hidden flex touch-pan-x gap-2xs overflow-x-auto overscroll-contain">
            {MEDIA_FILTERS.map((option) => (
              <Chip
                key={option.id}
                isSelected={option.id === filter.id}
                onClick={() => setFilter(option)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </ShellOverlay>
  );

  function handleChange(cropper: CropperRef) {
    const coordinates = cropper.getCoordinates();

    if (coordinates) {
      setCroppedArea({
        x: coordinates.left,
        y: coordinates.top,
        width: coordinates.width,
        height: coordinates.height,
      });
    }
  }

  async function save() {
    if (!croppedArea) {
      return;
    }

    setIsSaving(true);

    try {
      onDone(await applyEdit(draft, croppedArea, { ...editOptions, filter }));
    } catch {
      toast.error("사진을 편집하지 못했어요");
    } finally {
      setIsSaving(false);
    }
  }
}
