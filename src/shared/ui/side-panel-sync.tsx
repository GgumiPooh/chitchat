"use client";

import { SIDE_PANEL_MEDIA_QUERY } from "@/shared/config";
import { useSidePanel } from "@/shared/lib";
import { useEffect } from "react";

export type SidePanelSyncProps = Record<never, never>;

// INFO: Widening past `lg` opens the panel — a window that grew (or a tablet that rotated) is asking for the desktop layout whole, not the last state it was closed in.
export function SidePanelSync({}: SidePanelSyncProps) {
  const { isOpen, open } = useSidePanel();

  useEffect(() => {
    const query = window.matchMedia(SIDE_PANEL_MEDIA_QUERY);

    function handleChange(event: MediaQueryListEvent) {
      if (event.matches && !isOpen) {
        open();
      }
    }

    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, [isOpen, open]);

  return null;
}
