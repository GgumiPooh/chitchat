"use client";

import { SIDE_PANEL_MEDIA_QUERY } from "@/shared/config";
import { cn, isCommandKey, isCtrlKey, isLetterKey, useSidePanel } from "@/shared/lib";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { useEffect } from "react";
import { IconButton } from "./icon-button";

export type SidePanelToggleProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 8.14. Toggles side panel with ⌘\, ⌃\, ⌘B, ⌃B, ⌘`, ⌃`.
export function SidePanelToggle({ className }: SidePanelToggleProps) {
  const { isOpen, toggle } = useSidePanel();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isModifier = isCommandKey(event) || isCtrlKey(event);
      const isToggleKey =
        event.key === "\\" ||
        event.code === "Backslash" ||
        event.key === "`" ||
        event.code === "Backquote" ||
        isLetterKey(event, "b");

      if (event.isComposing || !isModifier || !isToggleKey) {
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
