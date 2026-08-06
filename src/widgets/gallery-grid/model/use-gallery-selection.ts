"use client";

import { MAX_GALLERY_SELECTION } from "@/shared/config";
import { toast } from "@/shared/ui";
import { useCallback, useMemo, useState } from "react";

/**
 * The multi-select of REQUIREMENTS.md § 10. Entered from the header control with no
 * tile picked, or by holding one — which is `start`'s argument.
 */
export function useGallerySelection() {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

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

      // INFO: The cap the delete endpoint enforces anyway (§ 14.), said here instead of as a rejected request after the user picked two hundred and one.
      if (selectedIds.length >= MAX_GALLERY_SELECTION) {
        toast.error(`한 번에 ${MAX_GALLERY_SELECTION}장까지 선택할 수 있어요`);

        return;
      }

      setSelectedIds((previous) => [...previous, id]);
    },
    [selected, selectedIds.length],
  );

  return { isSelecting, selectedIds, selected, start, cancel, toggle };
}
