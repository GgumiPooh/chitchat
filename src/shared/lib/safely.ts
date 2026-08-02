import type { Optional } from "./nullish";

export function safelyGet<T>(callback: () => T): Optional<T> {
  try {
    return callback();
  } catch {
    return undefined;
  }
}

export async function safelyGetAsync<T>(callback: () => Promise<T>): Promise<Optional<T>> {
  try {
    return await callback();
  } catch {
    return undefined;
  }
}

export function safelyRun(callback: () => void): void {
  try {
    callback();
  } catch {
    return;
  }
}

export async function safelyRunAsync(callback: () => Promise<void>): Promise<void> {
  try {
    await callback();
  } catch {
    return;
  }
}
