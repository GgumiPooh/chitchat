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

/**
 * When a request last failed to reach anything at all — the other half of the same
 * first-hand evidence.
 *
 * INFO: It exists so the corroboration `useIsOffline` performs can be *satisfied* rather than only waited out. The reason the flag is distrusted is a stack that reports `false` while requests keep working; a request that has actually failed is the case that reason does not cover.
 */
let lastFailedAt = 0;

/**
 * Records that a request never got an answer.
 *
 * WARN: A transport failure only. An HTTP status of any kind went through `markNetworkReached` — the question was heard — and 절전 모드's own refusal never left the client, so neither may land here.
 *
 * WARN: This may only ever *shorten* a verdict `navigator.onLine` has already reached, never reach one of its own. A `fetch` rejects with the same `TypeError` for a CORS denial and a blocked origin as for a dead network, so on its own it would report an outage for a misconfigured bucket.
 */
export function markNetworkUnreachable(): void {
  lastFailedAt = Date.now();
  listeners.forEach((listener) => listener());
}

export function getLastNetworkFailedAt(): number {
  return lastFailedAt;
}

export function subscribeNetworkReached(onChange: () => void): () => void {
  listeners.add(onChange);

  return () => {
    listeners.delete(onChange);
  };
}
