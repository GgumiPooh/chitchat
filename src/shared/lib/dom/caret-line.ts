import type { Maybe, Nullable } from "../nullish";

let measurementCanvas: Nullable<HTMLCanvasElement> = null;

function getMeasurementContext(): Nullable<CanvasRenderingContext2D> {
  if (typeof document === "undefined") {
    return null;
  }

  if (!measurementCanvas) {
    measurementCanvas = document.createElement("canvas");
  }

  return measurementCanvas.getContext("2d");
}

/**
 * Checks whether the text caret is currently located on the very first line of
 * an input element (HTMLTextAreaElement or contenteditable element).
 *
 * Accounts for explicit line breaks (`\n`) as well as soft line wraps based on
 * available element width and font metrics.
 */
export function isCaretOnFirstLine(
  field: Maybe<HTMLElement | HTMLTextAreaElement>,
  text?: string,
): boolean {
  if (!field) {
    return true;
  }

  if (field instanceof HTMLTextAreaElement) {
    const value = text ?? field.value;
    const caret = field.selectionStart ?? 0;
    const textBefore = value.slice(0, caret);

    if (textBefore.includes("\n")) {
      return false;
    }

    if (caret === 0) {
      return true;
    }

    // INFO: A single-line textarea with field-sizing: content intrinsic height
    if (field.scrollHeight <= field.clientHeight + 2) {
      return true;
    }

    const ctx = getMeasurementContext();
    if (!ctx) {
      return true;
    }

    const style = window.getComputedStyle(field);
    ctx.font = `${style.fontSize} ${style.fontFamily}`;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const availableWidth = field.clientWidth - paddingLeft - paddingRight;

    if (availableWidth <= 0) {
      return true;
    }

    const measuredWidth = ctx.measureText(textBefore).width;

    return measuredWidth <= availableWidth;
  }

  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return true;
  }

  const range = selection.getRangeAt(0);
  const caretRect = range.getBoundingClientRect();
  const fieldRect = field.getBoundingClientRect();

  if (caretRect.height === 0 && caretRect.top === 0) {
    if (text) {
      return !text.slice(0, range.startOffset).includes("\n");
    }

    return true;
  }

  const style = window.getComputedStyle(field);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const lineHeight = parseFloat(style.lineHeight) || 24;

  return caretRect.top <= fieldRect.top + paddingTop + lineHeight + 2;
}
