"use client";

import type { MediaDraft } from "@/entities/media";
import { cn, type Nullable } from "@/shared/lib";
import { Button, Chip, IconButton, ShellOverlay, toast } from "@/shared/ui";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { applyEdit } from "../model/apply-edit";
import { DEFAULT_FILTER, MEDIA_FILTERS, type MediaFilter } from "../model/filters";

const ASPECT_OPTIONS = [
  { id: "original", label: "원본", ratio: null },
  { id: "square", label: "1:1", ratio: 1 },
  { id: "portrait", label: "4:5", ratio: 4 / 5 },
  { id: "landscape", label: "16:9", ratio: 16 / 9 },
] as const;

const MAX_ZOOM = 4;

export type MediaEditorProps = {
  className?: string;
  draft: MediaDraft;
  onCancel: () => void;
  onDone: (draft: MediaDraft) => void;
};

/**
 * Crop and filter, over the chat surface.
 *
 * WARN: `absolute`, never `fixed` — AGENTS.md § 4.4. keeps the app shell as the
 * one fixed element, because a second one drifts against the keyboard on WebKit.
 * `ShellOverlay` is what makes the shell, rather than the chat room, the box this
 * fills: staying inside the scroller leaves it under the header and the tab bar.
 */
export function MediaEditor({ className, draft, onCancel, onDone }: MediaEditorProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [aspectId, setAspectId] = useState<string>("original");
  const [filter, setFilter] = useState<MediaFilter>(DEFAULT_FILTER);
  const [croppedArea, setCroppedArea] = useState<Nullable<Area>>(null);
  const [isSaving, setIsSaving] = useState(false);
  // INFO: `draft.previewUrl` is the thumbnail's blob, so the cropper needs a URL for the original of its own. Empty until the effect below mints one.
  const [sourceUrl, setSourceUrl] = useState("");
  const aspect =
    ASPECT_OPTIONS.find((option) => option.id === aspectId)?.ratio ?? draft.width / draft.height;

  // WARN: Created and revoked inside one effect, never from a `useState` initializer. StrictMode runs setup → cleanup → setup on mount, and state survives that cycle: a URL minted during render would be revoked by the first cleanup and the cropper would then point at a dead blob for the rest of the edit.
  useEffect(() => {
    const url = URL.createObjectURL(draft.file);

    // eslint-disable-next-line react-hooks/set-state-in-effect -- The object URL is external state; minting it and handing it to React is this effect's whole purpose.
    setSourceUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [draft.file]);

  return (
    <ShellOverlay>
      <div className={cn("absolute inset-0 z-40 flex flex-col bg-scrim", className)}>
        <div className="flex items-center justify-between p-sm pt-[max(var(--spacing-sm),env(safe-area-inset-top))]">
          <IconButton
            className="text-on-primary hover:bg-canvas/15 hover:text-on-primary"
            Icon={X}
            aria-label="편집 취소"
            onClick={onCancel}
          />
          <Button className="h-11 w-auto px-md" disabled={isSaving} onClick={() => void save()}>
            완료
          </Button>
        </div>
        <div className="relative min-h-0 flex-1">
          {/* INFO: `react-easy-crop` measures and loads on mount, so it waits for a real `src` rather than mounting against an empty one. */}
          {sourceUrl && (
            <Cropper
              image={sourceUrl}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              maxZoom={MAX_ZOOM}
              objectFit="contain"
              showGrid
              style={{ mediaStyle: { filter: filter.value } }}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_, areaPixels) => setCroppedArea(areaPixels)}
            />
          )}
        </div>
        <div className="space-y-xs p-sm pb-[max(var(--spacing-sm),env(safe-area-inset-bottom))]">
          <div className="scrollbar-hidden flex gap-2xs overflow-x-auto">
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
          <div className="scrollbar-hidden flex gap-2xs overflow-x-auto">
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

  async function save() {
    if (!croppedArea) {
      return;
    }

    setIsSaving(true);

    try {
      onDone(await applyEdit(draft, croppedArea, filter));
    } catch {
      toast.error("사진을 편집하지 못했어요");
    } finally {
      setIsSaving(false);
    }
  }
}
