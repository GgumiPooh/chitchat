"use client";

import { APP_SHELL_ID } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { useSyncExternalStore, type PropsWithChildren } from "react";
import { createPortal } from "react-dom";
import { Container } from "./container";

export type ShellOverlayProps = PropsWithChildren<{
  className?: string;
}>;

/**
 * Moves a full-screen overlay out of the screen that raised it and into the shell
 * box, so it renders over the floating header and the tab bar.
 *
 * WARN: A portal, not a bigger `z-index`. Those bars are siblings of the screen
 * (DESIGN.md § 3.5.), so an overlay left inside one is in the wrong subtree to
 * outrank them however it is stacked.
 *
 * WARN: DESIGN.md § 3.3. The layer below is what an `absolute inset-0` child fills,
 * and it has to be re-established here: the shell column is in flow now and grows
 * with the screen, so an overlay resolved against it spans every month ever loaded
 * and centres its label far below the fold. This is the § 4.4. `fixed` the bars
 * take, for the same reason and in one place rather than nine.
 */
export function ShellOverlay({ className, children }: ShellOverlayProps) {
  const shell = useSyncExternalStore(subscribe, readShell, readServerShell);

  return shell
    ? createPortal(
        // WARN: Transparent to the pointer, because a bar-shaped overlay (§ 10.'s selection bar) leaves the grid behind it tappable. A child that covers the screen re-enables it on itself.
        // WARN: `z-40` belongs on the layer, and it is what makes every `z-` inside it mean anything. `position: fixed` establishes a stacking context whatever its own z-index is, so the children are sealed in here — left at `z-auto` the whole layer painted *below* the `z-30` bars, and no `z-50` on a child could reach past them. Raise this, never a child, and keep it under the `z-50` the `body`-level sheets are portalled at.
        <Container
          className={cn(
            // WARN: DESIGN.md § 3.4. `--keyboard-pan` and never `--viewport-top` — the raw property is also non-zero while Safari collapses its toolbar, which would drop this layer below the visible area on a screen with no keyboard in it.
            "pointer-events-none fixed inset-x-0 top-(--keyboard-pan) z-40 h-[var(--viewport-height,100dvh)] px-0",
            className,
          )}
        >
          {children}
        </Container>,
        shell,
      )
    : null;
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
