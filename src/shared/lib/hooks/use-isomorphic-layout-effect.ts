"use client";

import { useEffect, useLayoutEffect } from "react";

/**
 * `useLayoutEffect`, except on the server, where React warns that it does
 * nothing — a client component still renders there.
 *
 * INFO: For work that has to land before the browser paints. A passive effect runs a frame later, which for anything that moves the scroll is a frame of the wrong position on screen.
 */
export const useIsomorphicLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;
