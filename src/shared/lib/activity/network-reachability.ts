/**
 * When a request to our own API last came back, which is the only first-hand
 * evidence this app has that the network works.
 *
 * WARN: No `"use client"`, exactly as `dormancy.ts` beside it has none. `request()` imports both, and a directive here would make that module a client boundary — plain module state needs none, and a stray call from the server then costs nothing but a variable nobody reads.
 *
 * INFO: `navigator.onLine` is the second-hand kind, and MDN records it as unreliable in exactly one direction that matters — a VPN, a VM and several Linux stacks report `false` on a working connection. `useIsOffline` corroborates the flag against this before letting anything act on it.
 */
let lastReachedAt = 0;

const listeners = new Set<() => void>();

/**
 * Records that the network answered.
 *
 * WARN: Called from `request()` alone, on a settled response of any status. A `4xx`
 * is a server that heard the question, which is the whole of what is being recorded
 * here — narrowing this to `response.ok` would let a run of legitimate `401`s read as
 * an outage.
 */
export function markNetworkReached(): void {
  lastReachedAt = Date.now();
  listeners.forEach((listener) => listener());
}

export function getLastNetworkReachedAt(): number {
  return lastReachedAt;
}

export function subscribeNetworkReached(onChange: () => void): () => void {
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
  };
}
