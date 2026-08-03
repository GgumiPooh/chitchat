"use client";

import { APP_SCROLL_ID } from "@/shared/config";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Sends the shell's scroll container back to the top on navigation. The document itself never scrolls (DESIGN.md § 3.4.). */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    const scroller = document.getElementById(APP_SCROLL_ID);

    if (scroller) {
      scroller.scrollTop = 0;
    }
  }, [pathname]);

  return null;
}
