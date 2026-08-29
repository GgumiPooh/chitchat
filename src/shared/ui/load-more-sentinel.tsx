"use client";

import { cn, type Nullable } from "@/shared/lib";
import { useEffect, useRef, type RefObject } from "react";

export type LoadMoreSentinelProps = {
  className?: string;
  /** The scroller the sentinel is watched inside; `undefined` observes against the viewport. */
  rootRef?: RefObject<Nullable<HTMLElement>>;
  onVisible: () => void;
};

// INFO: Asked for a screen ahead of the edge, so the next section lands before the reader reaches an empty bottom.
const LOAD_AHEAD_MARGIN = "320px";

export function LoadMoreSentinel({ className, rootRef, onVisible }: LoadMoreSentinelProps) {
  const ref = useRef<Nullable<HTMLDivElement>>(null);

  useEffect(() => {
    const sentinel = ref.current;

    if (!sentinel) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          onVisible();
        }
      },
      { root: rootRef?.current ?? null, rootMargin: LOAD_AHEAD_MARGIN },
    );

    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [onVisible, rootRef]);

  return <div ref={ref} className={cn("h-px w-full", className)} aria-hidden />;
}
