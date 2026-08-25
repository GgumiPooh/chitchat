"use client";

import { SIDE_PANEL_MEDIA_QUERY } from "@/shared/config";
import { cn, isCommandKey, useSidePanel } from "@/shared/lib";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useEffect } from "react";
import { IconButton } from "./icon-button";

export type SidePanelToggleProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 8.14. `⌘\` is Notion's binding; `⌘\`` belongs to macOS window cycling and never reaches the page.
export function SidePanelToggle({ className }: SidePanelToggleProps) {
  const { isOpen, toggle } = useSidePanel();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.isComposing || !isCommandKey(event) || event.key !== "\\") {
        return;
      }

      if (!window.matchMedia(SIDE_PANEL_MEDIA_QUERY).matches) {
        return;
      }

      event.preventDefault();
      toggle();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return (
    <IconButton
      className={cn("hidden lg:flex", className)}
      Icon={isOpen ? PanelLeftClose : PanelLeft}
      variant="floating"
      haptic
      aria-label={isOpen ? "사이드 패널 닫기" : "사이드 패널 열기"}
      aria-pressed={isOpen}
      onClick={toggle}
    />
  );
}
