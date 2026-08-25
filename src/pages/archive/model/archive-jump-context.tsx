"use client";

import type { Nullable } from "@/shared/lib";
import { createContext, useCallback, useContext, useRef, type PropsWithChildren } from "react";

type JumpHandler = (monthKey: string) => void;

type ArchiveJumpValue = {
  /** Called by the `lg` panel's month row; does nothing while no shelf page has registered a handler. */
  jump: (monthKey: string) => void;
  /** Called by the mounted shelf page; returns the cleanup that un-registers it. */
  registerJumpHandler: (handler: JumpHandler) => () => void;
};

const ArchiveJumpContext = createContext<Nullable<ArchiveJumpValue>>(null);

export type ArchiveJumpProviderProps = PropsWithChildren;

/**
 * AGENTS.md § 4.1. `app/(main)/archive/layout.tsx`'s panel persists across the
 * three shelf routes, but scrolling is each shelf page's own business — this is
 * the wire between the two: the mounted page registers how to jump, and the panel
 * calls it without knowing which shelf it is talking to. A ref, not state, since a
 * jump is an imperative instruction, and state would lag a commit behind during
 * the route transition between two pages' mounts.
 */
export function ArchiveJumpProvider({ children }: ArchiveJumpProviderProps) {
  const handlerRef = useRef<Nullable<JumpHandler>>(null);

  const registerJumpHandler = useCallback((handler: JumpHandler) => {
    handlerRef.current = handler;

    return () => {
      // WARN: Only clears its own handler — the next page's mount effect can register before this cleanup runs, and clearing unconditionally could drop a handler that already replaced this one.
      if (handlerRef.current === handler) {
        handlerRef.current = null;
      }
    };
  }, []);

  const jump = useCallback((monthKey: string) => {
    handlerRef.current?.(monthKey);
  }, []);

  return <ArchiveJumpContext value={{ jump, registerJumpHandler }}>{children}</ArchiveJumpContext>;
}

export function useArchiveJump(): ArchiveJumpValue {
  const context = useContext(ArchiveJumpContext);

  if (!context) {
    throw new Error("useArchiveJump must be used within ArchiveJumpProvider");
  }

  return context;
}
