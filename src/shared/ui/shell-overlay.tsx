"use client";

import { APP_SHELL_ID } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { useSyncExternalStore, type PropsWithChildren } from "react";
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
  const shell = useSyncExternalStore(subscribe, readShell, readServerShell);

  return shell ? createPortal(children, shell) : null;
}

// INFO: The shell is rendered by the `(main)` layout and outlives every overlay, so there is nothing to subscribe to.
const subscribe = () => () => {};

// INFO: The same element every call, so the snapshot is referentially stable and `useSyncExternalStore` will not loop.
function readShell(): Nullable<HTMLElement> {
  return document.getElementById(APP_SHELL_ID);
}

/**
 * WARN: The whole point of this hook, and why it is not `useState`. A lazy
 * `useState` reads the DOM on the **hydration** render, so the client mounts the
 * portal where the server rendered nothing and React throws a mismatch for the
 * whole tree (it fired on 보관함, whose drop overlay renders on first paint).
 * `useSyncExternalStore` renders the server's answer while hydrating and re-renders
 * with the real one immediately after, before paint.
 *
 * WARN: Still not an effect. An effect would mount the children a render late and
 * after paint, and anything inside that measures itself on mount — a cropper, a
 * scroll-snap track — would run against a box that does not exist yet.
 */
function readServerShell(): Nullable<HTMLElement> {
  return null;
}
