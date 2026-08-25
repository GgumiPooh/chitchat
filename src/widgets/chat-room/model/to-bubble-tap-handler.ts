"use client";

import type { Optional } from "@/shared/lib";
import type { MouseEvent } from "react";

/**
 * A tap anywhere on the bubble's own body, for whichever of the two things the bubble
 * offers one: the § 8.6.1. jump to a § 6.10. quote's original, and § 8.16.'s 전체보기.
 * Both target the whole bubble rather than the small thing inside it that names them —
 * the body is the larger half, and a tap there that did nothing read as a dead spot.
 */
export function toBubbleTapHandler(onOpen: Optional<() => void>) {
  if (!onOpen) {
    return undefined;
  }

  return (event: MouseEvent<HTMLElement>) => {
    // WARN: The quote is a button and a link is the bubble's one navigation; both answer this tap themselves, so the copy arriving on the way up is either a second jump or a hijacked link.
    if (event.target instanceof Element && event.target.closest("a, button")) {
      return;
    }

    // INFO: The bubble is `select-text`, so a drag that ends inside it is a selection rather than a tap.
    if ((window.getSelection()?.toString().length ?? 0) > 0) {
      return;
    }

    onOpen();
  };
}
