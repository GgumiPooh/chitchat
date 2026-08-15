/**
 * REQUIREMENTS.md § 8.4.1. Whether the app is in 절전 모드.
 *
 * A module-level flag rather than context, for the same reason `isBusy` and
 * `hasUnsentWork` are: the reader is the request gate in `shared/api`, which is a
 * `fetch` wrapper and cannot hold a hook.
 */
let dormant = false;
let visible = false;
let visibleWakes = 0;

export function isDormant(): boolean {
  return dormant;
}

/**
 * REQUIREMENTS.md § 8.4.1. Whether that sleep is the one wearing 절전 모드.
 *
 * WARN: A departure's sleep is silent, so this is what a screen must read to know
 * the overlay took its focus or its keyboard — never `isDormant` beside it.
 */
export function isDormantVisible(): boolean {
  return visible;
}

const listeners = new Set<() => void>();

/**
 * WARN: § 8.4.1. Written by `useDormancy` and by nothing else. A second writer
 * would let the request gate and the overlay disagree about whether the app is
 * asleep, and the gate is the half nobody can see.
 */
export function setDormant(value: boolean, isVisible = false): void {
  if (dormant === value && visible === (value && isVisible)) {
    return;
  }

  if (visible && !value) {
    visibleWakes += 1;
  }

  dormant = value;
  visible = value && isVisible;
  listeners.forEach((listener) => listener());
}

/**
 * REQUIREMENTS.md § 8.14. How many times a 절전 모드 the reader could see has been
 * ended by them, for the screen that has to put focus back where it was taken from.
 *
 * WARN: A count and not `isDormantVisible` above, because the two ways the overlay
 * goes away cannot be told apart from the flag after the fact — and after the fact
 * is when the reader is asked. The app going away takes it down too, and that
 * render's effect can be deferred by a freeze until the resume, where it would find
 * a `visible` document and raise the keyboard at somebody who has just come back.
 */
export function countVisibleWakes(): number {
  return visibleWakes;
}

/**
 * REQUIREMENTS.md § 8.14. For a screen that has to put focus back where the overlay
 * took it from — `useSyncExternalStore`'s subscribe half, over the flags above.
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
