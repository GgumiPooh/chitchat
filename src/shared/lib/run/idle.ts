/**
 * Runs `callback` on an idle frame, or after `timeout` at the latest, and returns
 * the cancel for whichever of the two is pending.
 *
 * WARN: iOS Safari only shipped `requestIdleCallback` in 17, so a `setTimeout` of the same ceiling stands in there — work a moment late is not the failure a polyfill would be worth.
 */
export function runWhenIdle(callback: () => void, timeout: number): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });

    return () => window.cancelIdleCallback(handle);
  }

  const handle = setTimeout(callback, timeout);

  return () => clearTimeout(handle);
}
