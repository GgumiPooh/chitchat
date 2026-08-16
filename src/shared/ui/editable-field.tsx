"use client";

import { cn, hasDataTransferFiles, type Nullable } from "@/shared/lib";
import {
  useCallback,
  useEffect,
  useRef,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  type Ref,
  type UIEvent,
} from "react";

// INFO: What a browser wraps a line in when Enter is pressed inside a `contenteditable`; each one closes the line before it.
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "PRE"]);

export type EditableFieldProps = PropsWithChildren<{
  ref?: Ref<Nullable<HTMLDivElement>>;
  className?: string;
  fieldClassName?: string;
  placeholderClassName?: string;
  /**
   * The draft this field holds.
   *
   * WARN: Written into the DOM only when it differs from what the field last reported,
   * so an edit is never reconciled against the nodes the browser's own editing commands
   * just moved. A truly controlled `children` tears a Hangul composition mid-syllable.
   */
  value: string;
  placeholder?: string;
  maxLength?: number;
  "aria-label": string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}>;

/**
 * A plain-text field that is a `contenteditable` rather than a `<textarea>`, with the
 * textarea's own contract — `value`, `onChange`, `placeholder`, `maxLength`.
 *
 * INFO: `Textarea` remains the primitive for every form field. This exists for the one
 * place that has to put elements *between* the characters, which a `<textarea>` renders
 * no DOM for and can never do (REQUIREMENTS.md § 13.6.).
 *
 * INFO: `children` are overlays laid against the field's own box — the caller's, since
 * the box is what they have to be measured in.
 */
export function EditableField({
  ref,
  className,
  fieldClassName,
  placeholderClassName,
  value,
  placeholder,
  maxLength,
  children,
  "aria-label": ariaLabel,
  onChange,
  onFocus,
  onKeyDown,
  onScroll,
}: EditableFieldProps) {
  const fieldRef = useRef<Nullable<HTMLDivElement>>(null);
  /**
   * What the DOM currently holds, as text.
   *
   * WARN: Seeded empty rather than from `value`, or a field mounted onto a draft never
   * writes it — the sync below would find the two already in agreement.
   */
  const shownRef = useRef("");
  // INFO: The caret as it stood when the field last lost it, so a programmatic `focus()` resumes rather than jumping to the front.
  const caretRef = useRef<Nullable<Range>>(null);
  // WARN: Nothing may rewrite the field while this is true. A Hangul IME owns the nodes it is composing into, and replacing them settles the syllable in flight twice.
  const isComposingRef = useRef(false);

  const takeField = useCallback(
    (node: Nullable<HTMLDivElement>) => {
      fieldRef.current = node;

      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        ref.current = node;
      }
    },
    [ref],
  );

  /**
   * WARN: A document listener, because there is no element-level selection event. A
   * `keyup`/`mouseup` pair misses the caret a drag-select or an IME left behind.
   */
  useEffect(() => {
    function remember() {
      const field = fieldRef.current;
      const selection = document.getSelection();

      if (!field || !selection || selection.rangeCount === 0) {
        return;
      }

      const range = selection.getRangeAt(0);

      if (field.contains(range.commonAncestorContainer)) {
        caretRef.current = range.cloneRange();
      }
    }

    document.addEventListener("selectionchange", remember);

    return () => document.removeEventListener("selectionchange", remember);
  }, []);

  useEffect(() => {
    const field = fieldRef.current;

    if (!field || value === shownRef.current || isComposingRef.current) {
      return;
    }

    shownRef.current = value;
    // INFO: One text node, and `whitespace-pre-wrap` is what draws its newlines — which is also what `readEditableText` reads back unchanged.
    field.textContent = value;

    if (document.activeElement === field) {
      collapseToEnd(field);
    }
  }, [value]);

  /**
   * WARN: A native listener rather than React's `onBeforeInput`, because the cancellation
   * has to reach the real `beforeinput` — the only event that can refuse an insertion
   * before it lands, and a `contenteditable` has no `maxLength` of its own.
   */
  useEffect(() => {
    const field = fieldRef.current;
    const limit = maxLength;

    if (!field || limit === undefined) {
      return;
    }

    const guard = (event: InputEvent) => {
      // WARN: A composing keystroke is never refused. Cancelling one leaves the IME's own buffer and the DOM disagreeing, and the syllable in flight is duplicated when it settles.
      if (event.isComposing) {
        return;
      }

      const inserted = event.data ?? (isLineBreak(event.inputType) ? "\n" : null);

      if (inserted === null) {
        return;
      }

      const replaced = document.getSelection()?.toString().length ?? 0;

      if (shownRef.current.length - replaced + inserted.length > limit) {
        event.preventDefault();
      }
    };

    field.addEventListener("beforeinput", guard);

    return () => field.removeEventListener("beforeinput", guard);
  }, [maxLength]);

  return (
    <div className={cn("relative", className)}>
      <div
        ref={takeField}
        className={cn("break-words whitespace-pre-wrap outline-none", fieldClassName)}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        aria-label={ariaLabel}
        onInput={report}
        onCompositionStart={startComposition}
        onCompositionEnd={endComposition}
        onFocus={handleFocus}
        onKeyDown={onKeyDown}
        onPaste={handlePaste}
        onDrop={handleDrop}
        onScroll={onScroll}
      />
      {/* WARN: `:empty` cannot carry this — a field the user emptied holds the browser's filler `<br>` and stops matching. */}
      {value.length === 0 && placeholder !== undefined && (
        <span
          className={cn("pointer-events-none absolute inset-0 select-none", placeholderClassName)}
          aria-hidden
        >
          {placeholder}
        </span>
      )}
      {children}
    </div>
  );

  /**
   * WARN: The limit is trimmed back here as well as refused in `beforeinput`, and both
   * are needed. `execCommand` insertions — this component's own paste, and the room's
   * ⌘V with nothing focused — do not raise a `beforeinput` that can be cancelled, so
   * that guard alone lets a pasted wall of text past the limit the server enforces.
   */
  function report() {
    const field = fieldRef.current;

    if (!field) {
      return;
    }

    let next = readEditableText(field);

    if (maxLength !== undefined && next.length > maxLength && !isComposingRef.current) {
      // WARN: Read before the rewrite and restored after it, never `collapseToEnd`. The overflow is trimmed off the *end*, so a paste into the middle of a nearly full draft leaves the caret well short of it — sent to the end, the next character typed lands at the far side of the message instead of after what was just pasted.
      const caret = document.activeElement === field ? toCaretOffset(field) : null;

      next = next.slice(0, maxLength);
      field.textContent = next;

      if (caret !== null) {
        placeCaret(field, Math.min(caret, next.length));
      }
    }

    shownRef.current = next;
    onChange(next);
  }

  function startComposition() {
    isComposingRef.current = true;
  }

  // INFO: The DOM is this field's source of truth, so settling the syllable is reported like any other edit — which is also what reconciles anything the sync above skipped while it was in flight.
  function endComposition() {
    isComposingRef.current = false;
    report();
  }

  /**
   * WARN: The caret is only placed when it is not already inside. A click has set the
   * selection by the time this fires, and moving it would make every tap into the middle
   * of a draft jump to the end instead.
   */
  function handleFocus() {
    const field = fieldRef.current;
    const selection = document.getSelection();

    if (field && selection && !isCaretInside(field, selection)) {
      restoreCaret(field, selection);
    }

    onFocus?.();
  }

  function restoreCaret(field: HTMLDivElement, selection: Selection) {
    const saved = caretRef.current;

    if (saved && field.contains(saved.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(saved);

      return;
    }

    collapseToEnd(field);
  }

  /**
   * WARN: A `contenteditable` takes the clipboard's `text/html` by default — a whole
   * document's markup, and an `<img>` for a copied picture, pasted into the draft.
   *
   * WARN: REQUIREMENTS.md § 9.2. A clipboard carrying files is left entirely alone.
   * `useFilePaste` stages those from `window`, which this handler runs ahead of, so
   * inserting the text half here is exactly what that rule forbids.
   */
  function handlePaste(event: ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();

    if (hasDataTransferFiles(event.clipboardData)) {
      return;
    }

    const replaced = document.getSelection()?.toString().length ?? 0;
    const room =
      maxLength === undefined ? undefined : maxLength - shownRef.current.length + replaced;
    const text = event.clipboardData.getData("text/plain").slice(0, room);

    if (text.length > 0) {
      // INFO: The one insertion the field's own undo stack survives, and it raises the `input` this component reports through.
      document.execCommand("insertText", false, text);
    }
  }

  // INFO: A drop is the same markup path as a paste, and `FileDropGuard` answers the file half from `window` regardless.
  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }
}

function isLineBreak(inputType: string): boolean {
  return inputType === "insertParagraph" || inputType === "insertLineBreak";
}

function isCaretInside(field: HTMLDivElement, selection: Selection): boolean {
  return (
    selection.rangeCount > 0 && field.contains(selection.getRangeAt(0).commonAncestorContainer)
  );
}

/**
 * Where the caret sits, counted in the same text `readEditableText` reports.
 *
 * WARN: Measured by reading a clone of everything ahead of the caret rather than by
 * `Range.toString()`, which drops the newlines the blocks around it stand for — off by
 * one per line, the restored caret drifts a character further back on every wrapped line.
 */
function toCaretOffset(field: HTMLDivElement): Nullable<number> {
  const selection = document.getSelection();

  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const caret = selection.getRangeAt(0);

  if (!field.contains(caret.endContainer)) {
    return null;
  }

  const ahead = document.createRange();

  ahead.selectNodeContents(field);
  ahead.setEnd(caret.endContainer, caret.endOffset);

  const parts: string[] = [];

  collect(ahead.cloneContents(), parts);

  return parts.join("").length;
}

// INFO: The rewrite left one text node behind, so the offset addresses it directly.
function placeCaret(field: HTMLDivElement, offset: number) {
  const node = field.firstChild;

  if (node === null || node.nodeType !== Node.TEXT_NODE) {
    collapseToEnd(field);

    return;
  }

  const selection = document.getSelection();
  const range = document.createRange();

  range.setStart(node, Math.min(offset, node.nodeValue?.length ?? 0));
  range.collapse(true);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function collapseToEnd(field: HTMLDivElement) {
  const selection = document.getSelection();
  const range = document.createRange();

  range.selectNodeContents(field);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/**
 * The field's text, with the blocks and `<br>`s the browser builds out of Enter read back
 * as the newlines they stand for.
 *
 * WARN: Not `textContent`, which concatenates the lines with nothing between them.
 */
function readEditableText(root: HTMLElement): string {
  const parts: string[] = [];

  collect(root, parts);

  return parts.join("");
}

function collect(node: Node, out: string[]) {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      out.push(child.nodeValue ?? "");
      continue;
    }

    if (!(child instanceof HTMLElement)) {
      continue;
    }

    if (child.tagName === "BR") {
      // WARN: A `<br>` with nothing after it is the browser's own filler, keeping an empty block visible — read, it appends a newline the user never typed to every draft.
      if (child.nextSibling !== null) {
        out.push("\n");
      }

      continue;
    }

    if (BLOCK_TAGS.has(child.tagName) && out.length > 0) {
      out.push("\n");
    }

    collect(child, out);
  }
}
