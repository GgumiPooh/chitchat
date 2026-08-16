"use client";

import { OBJECT_PLACEHOLDER, countObjectPlaceholders } from "@/shared/config";
import { cn, hasDataTransferFiles, type Nullable } from "@/shared/lib";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";

// INFO: What a browser wraps a line in when Enter is pressed inside a `contenteditable`; each one closes the line before it.
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "PRE"]);

// INFO: Carried on the host element rather than in a ref beside it, because the browser owns these nodes once they are written — a deletion is only ever visible in the DOM.
const OBJECT_KEY_ATTRIBUTE = "data-object-key";

// WARN: Hoisted so a field with no objects passes one array identity — an inline `= []` re-runs the memo below on every keystroke.
const NO_OBJECTS: readonly EditableObject[] = [];

/** One element standing between the characters of `value`, at its `OBJECT_PLACEHOLDER`. */
export type EditableObject = {
  /**
   * WARN: Stable across edits, and the caller's own handle on the object. `onChange`
   * reports the keys the draft still holds, in order, which is the only way to learn
   * *which* object a Backspace took — the text alone says only that one of them is gone.
   */
  key: string;
  node: ReactNode;
};

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
  /**
   * One per `OBJECT_PLACEHOLDER` in `value`, in the order they appear there.
   *
   * WARN: The pairing is the caller's to keep. A placeholder with no object here still
   * takes its character and draws an empty box rather than shortening the draft — the
   * offset of everything after it belongs to the text, not to this array.
   */
  objects?: readonly EditableObject[];
  placeholder?: string;
  maxLength?: number;
  "aria-label": string;
  onChange: (value: string, objectKeys: string[]) => void;
  onFocus?: () => void;
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void;
  onScroll?: (event: UIEvent<HTMLDivElement>) => void;
}>;

/**
 * A plain-text field that is a `contenteditable` rather than a `<textarea>`, with the
 * textarea's own contract — `value`, `onChange`, `placeholder`, `maxLength` — and
 * elements *between* the characters, which a `<textarea>` renders no DOM for and can
 * never do (REQUIREMENTS.md § 13.6.).
 *
 * INFO: `Textarea` remains the primitive for every form field.
 *
 * INFO: An object costs one character everywhere — `maxLength`, every offset below, and
 * the `value` reported out — because it is one character in the row that gets stored
 * (REQUIREMENTS.md § 6.).
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
  objects = NO_OBJECTS,
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
  // INFO: The hosts now in the field, in document order. Each caller's object is drawn into its own through a portal, so the browser goes on owning the nodes the caret moves through.
  const [hosts, setHosts] = useState<HTMLElement[]>([]);
  const objectsByKey = useMemo(
    () => new Map(objects.map((object) => [object.key, object])),
    [objects],
  );

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

    const previous = shownRef.current;

    shownRef.current = value;
    writeNodes(field, value, objects);
    setHosts(toHosts(field));

    /**
     * WARN: The caret follows the edit rather than collapsing to the end, and both
     * halves matter. A draft seeded from outside still ends at its end, which is what
     * the collapse gave; an object dropped into the middle of one leaves the caret
     * *after the object*, where a collapse would send the next keystroke to the far end
     * of the message. The saved range is rewritten with it, since the nodes it
     * addressed were the ones just replaced — a field that is not focused restores from
     * it later.
     */
    const caret = toRangeAt(field, toEditCaret(previous, value));

    caretRef.current = caret.cloneRange();

    if (document.activeElement === field) {
      const selection = document.getSelection();

      selection?.removeAllRanges();
      selection?.addRange(caret);
    }
  }, [value, objects]);

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
        className={cn("whitespace-pre-wrap outline-none", fieldClassName)}
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
      {/* WARN: Portalled into hosts this component built by hand, so React never reconciles the field's own children — the browser moves and deletes them as the user edits, which is precisely what a rendered tree may not have done under it. */}
      {hosts.map((host) => {
        const object = objectsByKey.get(host.getAttribute(OBJECT_KEY_ATTRIBUTE) ?? "");

        return object ? createPortal(object.node, host, object.key) : null;
      })}
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

    let { text: next, keys } = readEditableContent(field);

    if (maxLength !== undefined && next.length > maxLength && !isComposingRef.current) {
      // WARN: Read before the rewrite and restored after it, never `collapseToEnd`. The overflow is trimmed off the *end*, so a paste into the middle of a nearly full draft leaves the caret well short of it — sent to the end, the next character typed lands at the far side of the message instead of after what was just pasted.
      const caret = document.activeElement === field ? toCaretOffset(field) : null;

      next = next.slice(0, maxLength);
      // WARN: The keys the trimmed text still has placeholders for, and the rewrite carries them — writing the text alone would draw every surviving object as the raw placeholder character.
      keys = keys.slice(0, countObjectPlaceholders(next));
      writeNodes(field, next, keys.map(toHostedObject));

      if (caret !== null) {
        placeCaret(field, Math.min(caret, next.length));
      }
    }

    setHosts((current) => {
      const found = toHosts(field);

      return isSameHosts(current, found) ? current : found;
    });

    shownRef.current = next;
    onChange(next, keys);
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
    // WARN: The placeholder is stripped out of pasted text. It would be a character the caller has no object for — one the draft counts, the limit charges for, and nothing draws.
    const text = event.clipboardData
      .getData("text/plain")
      .replaceAll(OBJECT_PLACEHOLDER, "")
      .slice(0, room);

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
 * Writes `text` into the field as the nodes it stands for — its runs as text nodes, and
 * each `OBJECT_PLACEHOLDER` as an empty host for the caller's element.
 *
 * WARN: A host for every placeholder, including one the caller paired no object with. It
 * is the character that has to survive: dropped, the field holds a shorter draft than the
 * `value` it was handed, and every offset past it is short by one.
 */
function writeNodes(field: HTMLDivElement, text: string, objects: readonly EditableObject[]) {
  const nodes: Node[] = [];
  // INFO: N placeholders split into N+1 runs, so the last run is the only one no object follows.
  const runs = text.split(OBJECT_PLACEHOLDER);

  runs.forEach((run, index) => {
    if (run) {
      nodes.push(document.createTextNode(run));
    }

    if (index < runs.length - 1) {
      nodes.push(toObjectHost(objects[index]?.key ?? ""));
    }
  });

  field.replaceChildren(...nodes);
}

/**
 * WARN: `contenteditable="false"` is what makes the object one atom — Backspace takes the
 * whole of it, the caret can never land inside the caller's markup, and the browser moves
 * it as a unit. Without it the portalled element is editable content.
 */
function toObjectHost(key: string): HTMLElement {
  const host = document.createElement("span");

  host.setAttribute(OBJECT_KEY_ATTRIBUTE, key);
  host.contentEditable = "false";

  return host;
}

// INFO: The rewrite needs the keys and nothing else; what goes inside each host is drawn from `objects` by the render that follows.
function toHostedObject(key: string): EditableObject {
  return { key, node: null };
}

function toHosts(field: HTMLElement): HTMLElement[] {
  return [...field.querySelectorAll<HTMLElement>(`[${OBJECT_KEY_ATTRIBUTE}]`)];
}

function isSameHosts(current: readonly HTMLElement[], next: readonly HTMLElement[]): boolean {
  return current.length === next.length && current.every((host, index) => host === next[index]);
}

/**
 * Where the caret sits, counted in the same text `readEditableContent` reports.
 *
 * WARN: Measured by reading a clone of everything ahead of the caret rather than by
 * `Range.toString()`, which drops the newlines the blocks around it stand for — and the
 * objects, which it reports as nothing at all. Off by one per line or per object, the
 * restored caret drifts a character further back on each of them.
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

  return readEditableContent(ahead.cloneContents()).text.length;
}

function placeCaret(field: HTMLDivElement, offset: number) {
  const selection = document.getSelection();

  selection?.removeAllRanges();
  selection?.addRange(toRangeAt(field, offset));
}

function collapseToEnd(field: HTMLDivElement) {
  const selection = document.getSelection();
  const range = document.createRange();

  range.selectNodeContents(field);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** A collapsed range `offset` characters into the field, counted as the text reads. */
function toRangeAt(field: HTMLElement, offset: number): Range {
  const range = document.createRange();
  let remaining = offset;

  for (const atom of toAtoms(field, { hasEmitted: false })) {
    if (atom.kind === "text") {
      const length = atom.node.nodeValue?.length ?? 0;

      if (remaining <= length) {
        range.setStart(atom.node, remaining);
        range.collapse(true);

        return range;
      }

      remaining -= length;
      continue;
    }

    // INFO: An object and a line break are one character each, and the caret goes in front of the node standing for it.
    if (remaining === 0) {
      range.setStartBefore(atom.node);
      range.collapse(true);

      return range;
    }

    remaining -= 1;
  }

  range.selectNodeContents(field);
  range.collapse(false);

  return range;
}

/**
 * The field's content, with the blocks and `<br>`s the browser builds out of Enter read
 * back as the newlines they stand for and every object as its `OBJECT_PLACEHOLDER`,
 * beside the keys of the objects the field still holds.
 *
 * WARN: Not `textContent`, which concatenates the lines with nothing between them and
 * reads an object as nothing at all.
 */
function readEditableContent(root: Node): { text: string; keys: string[] } {
  const parts: string[] = [];
  const keys: string[] = [];

  for (const atom of toAtoms(root, { hasEmitted: false })) {
    if (atom.kind === "text") {
      parts.push(atom.node.nodeValue ?? "");
      continue;
    }

    if (atom.kind === "object") {
      parts.push(OBJECT_PLACEHOLDER);
      keys.push(atom.node.getAttribute(OBJECT_KEY_ATTRIBUTE) ?? "");
      continue;
    }

    parts.push("\n");
  }

  return { text: parts.join(""), keys };
}

type EditableAtom =
  | { kind: "text"; node: Text }
  | { kind: "object"; node: HTMLElement }
  | { kind: "break"; node: HTMLElement };

/**
 * Everything in the field worth a character of the draft, in the order it reads.
 *
 * WARN: One walk for both readers above, and that is the whole point of it — a caret
 * placed by a traversal that counted differently from the one that measured it lands
 * somewhere else, and the two only stay in agreement by being the same code.
 */
function* toAtoms(node: Node, state: { hasEmitted: boolean }): Generator<EditableAtom> {
  for (const child of node.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      state.hasEmitted = true;
      yield { kind: "text", node: child as Text };
      continue;
    }

    if (!(child instanceof HTMLElement)) {
      continue;
    }

    if (child.hasAttribute(OBJECT_KEY_ATTRIBUTE)) {
      state.hasEmitted = true;
      // INFO: Never descended into. Whatever markup the caller drew in there is one object to this field.
      yield { kind: "object", node: child };
      continue;
    }

    if (child.tagName === "BR") {
      // WARN: A `<br>` with nothing after it is the browser's own filler, keeping an empty block visible — read, it appends a newline the user never typed to every draft.
      if (child.nextSibling !== null) {
        yield { kind: "break", node: child };
      }

      continue;
    }

    if (BLOCK_TAGS.has(child.tagName) && state.hasEmitted) {
      yield { kind: "break", node: child };
    }

    yield* toAtoms(child, state);
  }
}

/**
 * Where the caret belongs once `next` has replaced `previous`: at the end of what
 * changed.
 *
 * INFO: The shared head and tail are what is left alone, so a whole draft seeded from
 * outside ends at its end, an object dropped into the middle of one ends just past the
 * object, and a cleared field ends at nothing.
 */
function toEditCaret(previous: string, next: string): number {
  let head = 0;

  while (head < previous.length && head < next.length && previous[head] === next[head]) {
    head += 1;
  }

  let tail = 0;

  while (
    tail < previous.length - head &&
    tail < next.length - head &&
    previous[previous.length - 1 - tail] === next[next.length - 1 - tail]
  ) {
    tail += 1;
  }

  return next.length - tail;
}
