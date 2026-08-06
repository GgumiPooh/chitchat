"use client";

import { MAX_GALLERY_SELECTION, MAX_GALLERY_SHARE_FILES } from "@/shared/config";
import { useIsIos } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useMemo, useRef, useState } from "react";

// INFO: One toast id for the cap, because a sweep sitting at it reaches it again on every tile it goes on covering, and sonner replaces a live toast rather than stacking another.
const CAP_TOAST_ID = "gallery-selection-cap";

function toCapMessage(cap: number): string {
  return `한 번에 ${cap}장까지 선택할 수 있어요`;
}

/** REQUIREMENTS.md § 10. What the held tile did, which the range the drag covers then repeats. */
type SweepAnchor = { base: string[]; mode: "select" | "deselect"; id: string };

/**
 * The multi-select of REQUIREMENTS.md § 10. Entered from the header control with no
 * tile picked, or by holding one — which is `start`'s argument.
 */
export function useGallerySelection() {
  // WARN: REQUIREMENTS.md § 10. iOS saves only through the share sheet, which cannot be handed more than `MAX_GALLERY_SHARE_FILES` — so there the selection is held to what the platform can act on, rather than letting the user sweep two hundred tiles into the only route they have and be refused. Everywhere else 저장 is a download with no such ceiling, so the selection keeps its own, and 삭제 keeps the reach that comes with it.
  const isIosDevice = useIsIos();
  const cap = isIosDevice ? MAX_GALLERY_SHARE_FILES : MAX_GALLERY_SELECTION;
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  // INFO: The selection the sweep started from. Every range the drag reports is applied to *this*, never to the last one, so pulling the finger back releases the tiles it has left behind.
  const anchorRef = useRef<SweepAnchor>({ id: "", base: [], mode: "select" });

  const start = useCallback((id?: string) => {
    setIsSelecting(true);
    setSelectedIds(id ? [id] : []);
  }, []);

  const cancel = useCallback(() => {
    setIsSelecting(false);
    setSelectedIds([]);
  }, []);

  // WARN: The cap is checked out here, not inside the updater. React may run an updater more than once for one call — twice under StrictMode — and a `toast` in there fires once per invocation.
  const toggle = useCallback(
    (id: string) => {
      if (selected.has(id)) {
        setSelectedIds((previous) => previous.filter((entry) => entry !== id));

        return;
      }

      // INFO: The cap the delete endpoint enforces anyway (§ 14.), said here instead of as a rejected request after the user picked one past it.
      if (selectedIds.length >= cap) {
        toast.error(toCapMessage(cap), { id: CAP_TOAST_ID });

        return;
      }

      setSelectedIds((previous) => [...previous, id]);
    },
    [cap, selected, selectedIds.length],
  );

  /** REQUIREMENTS.md § 10. The whole range from the held tile to the one under the finger, in grid order. */
  // WARN: The cap is applied out here rather than in an updater, so the toast is not at the mercy of one React may run twice (see `toggle`). It can be: the result is computed from the anchor's baseline rather than from the live selection, so there is nothing the updater would have known better.
  const sweepTo = useCallback(
    (ids: string[]) => {
      const { base, mode, id: anchorId } = anchorRef.current;

      if (mode === "deselect") {
        const dropped = new Set(ids);

        setSelectedIds(base.filter((entry) => !dropped.has(entry)));

        return;
      }

      const picked = new Set(base);
      const added = ids.filter((id) => !picked.has(id));
      const room = Math.max(cap - base.length, 0);

      if (added.length > room) {
        toast.error(toCapMessage(cap), { id: CAP_TOAST_ID });
      }

      // WARN: Truncated from the anchor outwards, not from the head of the range. A sweep running *up* the grid is ordered away from the finger, so keeping the first `room` would strip the mark off the held tile and everything under the finger and light up a distant block instead.
      const kept =
        ids[0] === anchorId ? added.slice(0, room) : added.slice(Math.max(added.length - room, 0));

      // WARN: A sweep held past the cap re-enters this on every further tile with nothing left to add. Writing the identical selection back would re-run the `Set` memo and re-render the grid once per tile, which is now reachable seven rows into a drag rather than sixty-seven.
      if (kept.length === 0 && base.length >= cap) {
        return;
      }

      setSelectedIds([...base, ...kept]);
    },
    [cap],
  );

  /**
   * REQUIREMENTS.md § 10. The tile a hold fired on: it takes the action a tap
   * would have, and that action is what the sweep repeats over the range the drag
   * goes on to cover.
   */
  const startSweep = useCallback(
    (id: string) => {
      const base = isSelecting ? selectedIds : [];

      anchorRef.current = { id, base, mode: base.includes(id) ? "deselect" : "select" };
      setIsSelecting(true);
      sweepTo([id]);
    },
    [isSelecting, selectedIds, sweepTo],
  );

  return { isSelecting, selectedIds, selected, start, cancel, toggle, startSweep, sweepTo };
}
