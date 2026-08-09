"use client";

import { useSyncExternalStore } from "react";

// WARN: Module constants, never inline arrows. `useSyncExternalStore` re-subscribes whenever `subscribe` changes identity, and a fresh closure per render is a teardown and a re-register on every commit — of every `PreloadFrame` on screen, since each one reads this.
const subscribe = () => () => {};
const getSnapshot = () => true;
const getServerSnapshot = () => false;

export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
