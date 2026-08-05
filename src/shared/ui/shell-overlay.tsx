"use client";

import { APP_SHELL_ID } from "@/shared/config";
import { useState, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";

export type ShellOverlayProps = PropsWithChildren;

/**
 * Moves a full-screen overlay out of the shell's scroller and into the shell box
 * itself, so it renders over the floating header and the tab bar.
 *
 * WARN: A portal, not a bigger `z-index`. Those bars are siblings of the scroller
 * (DESIGN.md § 3.5.), so an overlay left inside a screen is in the wrong subtree
 * to outrank them however it is stacked — and going `fixed` to escape is what
 * AGENTS.md § 4.4. rules out.
 */
export function ShellOverlay({ children }: ShellOverlayProps) {
  // WARN: Resolved on the first render, never from an effect. An effect would mount the children a render late, and anything inside that measures itself on mount — a cropper, a scroll-snap track — would run against a box that does not exist yet.
  const [shell] = useState(() =>
    typeof document === "undefined" ? null : document.getElementById(APP_SHELL_ID),
  );

  return shell ? createPortal(children, shell) : null;
}
