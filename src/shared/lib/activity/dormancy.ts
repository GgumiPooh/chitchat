/**
 * REQUIREMENTS.md § 8.4.1. Whether the app is in 절전 모드.
 *
 * A module-level flag rather than context, for the same reason `isBusy` and
 * `hasUnsentWork` are: the reader is the request gate in `shared/api`, which is a
 * `fetch` wrapper and cannot hold a hook.
 */
let dormant = false;

export function isDormant(): boolean {
  return dormant;
}

const listeners = new Set<() => void>();

/**
 * WARN: § 8.4.1. Written by `useDormancy` and by nothing else. A second writer
 * would let the request gate and the overlay disagree about whether the app is
 * asleep, and the gate is the half nobody can see.
 */
export function setDormant(value: boolean): void {
  if (dormant === value) {
    return;
  }

  dormant = value;
  listeners.forEach((listener) => listener());
}

/**
 * REQUIREMENTS.md § 8.14. For a screen that has to put focus back where the overlay
 * took it from — `useSyncExternalStore`'s subscribe half, over the flag above.
 *
 * INFO: A subscription rather than context, so the flag stays the one thing the
 * request gate in `shared/api` can read without a hook.
 */
export function subscribeDormancy(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
