import { useEffect, useRef, useState } from "react";
import { isEqual } from "lodash-es";
import { buildFadeMask } from "./fade-mask";

export function useScrollFade(direction: "to bottom" | "to right" = "to bottom") {
  const ref = useRef<HTMLDivElement>(null);
  const [{ canScrollPrev, canScrollNext }, setOverflow] = useState({
    canScrollPrev: false,
    canScrollNext: false,
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }

    function update() {
      if (!el) {
        return;
      }

      const isVertical = direction === "to bottom";
      const max = isVertical ? el.scrollHeight - el.clientHeight : el.scrollWidth - el.clientWidth;
      const pos = isVertical ? el.scrollTop : el.scrollLeft;

      const next = {
        canScrollPrev: pos > 1,
        canScrollNext: pos < max - 1,
      };

      setOverflow((current) => (isEqual(current, next) ? current : next));
    }

    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    // Also observe children to catch content changes
    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(el, { childList: true, subtree: true, characterData: true });

    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
      mutationObserver.disconnect();
    };
  }, [direction]);

  return {
    ref,
    maskStyle: {
      maskImage: buildFadeMask({
        direction,
        fadeStart: canScrollPrev,
        fadeEnd: canScrollNext,
      }),
    },
  };
}
