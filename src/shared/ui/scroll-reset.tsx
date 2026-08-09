"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Sends the document back to the top on navigation (DESIGN.md § 3.4.). */
export function ScrollReset() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
