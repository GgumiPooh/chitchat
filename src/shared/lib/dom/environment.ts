import type { Maybe } from "../nullish";

export function isBrowser(): boolean {
  return typeof window === "object";
}

/**
 * Whether a drag or a paste carries files, as opposed to a text selection.
 *
 * WARN: REQUIREMENTS.md § 9.2. `types`, never `files` — `DataTransfer.files` is empty
 * on `dragover` for security, so a guard reading it would never arm.
 */
export function hasDataTransferFiles(transfer: Maybe<DataTransfer>): boolean {
  return transfer?.types.includes("Files") ?? false;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

/**
 * Whether the connection is known to be one the reader pays for by the megabyte.
 *
 * WARN: REQUIREMENTS.md § 13.6. **Three-valued, collapsed to false when unknown.** The
 * Network Information API is Chromium's alone — iOS Safari exposes no `connection`, so
 * this cannot answer there and must not guess. Every caller therefore reads it as "hold
 * back a background cost when we can see a reason to", never as a guarantee.
 *
 * INFO: `saveData` and a slow `effectiveType` count as well as `type`. `type` is the only one that names the radio, and it is also the least widely populated of the three.
 */
export function isMeteredConnection(): boolean {
  if (!isBrowser()) {
    return false;
  }

  const connection = navigator.connection;

  if (!connection) {
    return false;
  }
  if (connection.saveData === true) {
    return true;
  }
  if (connection.type) {
    return connection.type === "cellular" || connection.type === "wimax";
  }

  return connection.effectiveType !== undefined && connection.effectiveType !== "4g";
}
