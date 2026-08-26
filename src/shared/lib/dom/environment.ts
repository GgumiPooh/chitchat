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
  if (target.isContentEditable || target.getAttribute("contenteditable") === "plaintext-only") {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
