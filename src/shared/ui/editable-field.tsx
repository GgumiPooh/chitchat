"use client";

import { OBJECT_PLACEHOLDER, countObjectPlaceholders } from "@/shared/config";
import {
  A_SECOND,
  cn,
  hasDataTransferFiles,
  takeFocusWithoutPan,
  type Nullable,
} from "@/shared/lib";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  type PropsWithChildren,
  type ReactNode,
  type Ref,
  type RefObject,
  type UIEvent,
} from "react";
import { createPortal } from "react-dom";

// INFO: What a browser wraps a line in when Enter is pressed inside a `contenteditable`; each one closes the line before it.
const BLOCK_TAGS = new Set(["DIV", "P", "LI", "BLOCKQUOTE", "PRE"]);

// INFO: Carried on the host element rather than in a ref beside it, because the browser owns these nodes once they are written — a deletion is only ever visible in the DOM.
const OBJECT_KEY_ATTRIBUTE = "data-object-key";

// WARN: How recent a press has to be for `handleFocus` to read the caret out of its coordinates. A programmatic `focus()` gets no press at all, and must not inherit one from a tap the reader made a moment earlier somewhere else.
const PRESS_FRESHNESS = A_SECOND;

/**
 * A zero-width space standing wherever the caret would otherwise have no text to be measured
 * in: immediately after every object, and on an empty last line.
 *
 * WARN: WebKit derives the caret's screen rect from the inline box beside it, and neither of
 * those places offers one — an object is a `contenteditable="false"` atom, and an empty last line
 * holds only the browser's filler `<br>`. Left with nothing to measure it falls back to a box
 * somewhere else entirely: the field's own left or right edge beside a mini, and the *previous*
 * line after an Enter. That is the whole family of iOS caret bugs here, and in every one of them
 * the selection was already correct — only the painted caret was wrong, which is why typing
 * always landed where the reader meant it to.
 *
 * WARN: Never a character of the draft. It is stripped from everything this component reports
 * and from every offset it counts, so `value`, `maxLength` and the stored row never see it.
 *
 * WARN: One per position and always *after* the character that needs it, never on both sides.
 * Two anchors meeting between adjacent objects are two Backspaces that delete nothing the reader
 * can see, which is the bug an anchor on each side shipped.
 */
const CARET_ANCHOR = "\u200b";

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
  /**
   * Where the caret stands in `value`, published for a caller that writes *into* the
   * draft — REQUIREMENTS.md § 13.6.'s mini.
   *
   * WARN: The caret the field last held, which is not always a live one: the panel that
   * inserts is opened by blurring this field, and § 8.14. inserts at that position with
   * no branch. Null only while the field has never held one, where the caller means the
   * end of the draft.
   */
  caretOffsetRef?: RefObject<Nullable<number>>;
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
  caretOffsetRef,
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
  // INFO: Where the press that is about to focus this field landed, so the caret can be read out of the tap rather than out of `caretRef`.
  const pressRef = useRef<Nullable<{ x: number; y: number; at: number }>>(null);
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

        const offset = toRangeOffset(field, range);

        if (caretOffsetRef && offset !== null) {
          caretOffsetRef.current = offset;
        }
      }
    }

    document.addEventListener("selectionchange", remember);

    return () => document.removeEventListener("selectionchange", remember);
  }, [caretOffsetRef]);

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
    const offset = toEditCaret(previous, value);
    const caret = toRangeAt(field, offset);

    caretRef.current = caret.cloneRange();

    // WARN: Published here as well as from `remember`, and this is the write that matters for an insertion made with the field blurred — nothing selects, so no `selectionchange` follows to measure. It is what puts the *next* mini after the one just inserted.
    if (caretOffsetRef) {
      caretOffsetRef.current = offset;
    }

    if (document.activeElement === field) {
      const selection = document.getSelection();

      selection?.removeAllRanges();
      selection?.addRange(caret);
    }
  }, [value, objects, caretOffsetRef]);

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

      // WARN: Stripped, or a selection that swept past an object would charge the limit for anchors the draft does not hold.
      const replaced = toStripped(document.getSelection()?.toString() ?? "").length;

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
        onPointerDown={rememberPress}
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

    /**
     * WARN: One trailing newline is the browser's own filler and is dropped here, exactly as
     * `toAtoms` drops a trailing `<br>` for the same reason. Under `white-space: pre-wrap` both
     * Chrome and WebKit answer a line break with **two** `\n` characters, the second only there
     * to give the new empty line something to be — measured, the field renders one new line, not
     * two. Read as written it counted every first break twice, and the anchor this component then
     * wrote onto that phantom line turned the miscount into a real third line.
     *
     * WARN: Only when no `<br>` closed the content, because the filler is one form or the other
     * and never both. Deleting the anchor off an empty last line leaves `…\n` plus a `<br>` — the
     * newline there is the reader's own and `toAtoms` has already dropped the `<br>` standing in
     * for it, so trimming again ate the break out of the draft while the DOM went on painting it.
     * That is one Backspace that changed nothing on screen and a second one to finish the job.
     *
     * WARN: Trimmed here and never inside `readEditableContent`, which also measures the content
     * *ahead of* the caret for `toRangeOffset` — a partial read legitimately ends at a newline,
     * and trimming that one puts every caret sitting just past a break one character too early.
     *
     * INFO: Unambiguous because this component's own canonical form never ends in a newline: a
     * draft that does gets a `CARET_ANCHOR` after it (`toAnchored`), so the field's last character
     * is the anchor rather than the break.
     */
    const read = readEditableContent(field);
    const hasFiller = read.raw.endsWith("\n") && !endsWithBreakElement(field);
    const raw = hasFiller ? read.raw.slice(0, -1) : read.raw;
    let next = toStripped(raw);
    let keys = read.keys;
    // WARN: Read before anything below rewrites the field, never `collapseToEnd`. A trim takes the overflow off the *end*, so a paste into the middle of a nearly full draft leaves the caret well short of it — sent to the end, the next character typed lands at the far side of the message instead of after what was just pasted.
    const caret = document.activeElement === field ? toCaretOffset(field) : null;
    // INFO: Where the caret has to be put back when this function rewrites the field, in the draft's own coordinates. Null leaves it wherever the browser's own edit left it.
    let placeAt: Nullable<number> = null;

    /**
     * WARN: A Backspace beside an object, or on an empty last line, reaches that position's
     * `CARET_ANCHOR` first — and deleting an anchor is not an edit the draft can show, so the
     * press is credited to the character the anchor stood after. Without this it takes two
     * presses to remove one mini or one blank line: one that appears to do nothing, then one
     * that works.
     *
     * WARN: Only when the text is otherwise unchanged. A selection that took the object *and*
     * text around it already reported the deletion, and the normalisation below is all it needs.
     */
    if (!isComposingRef.current && next === shownRef.current) {
      const missing = toMissingAnchor(raw, next);

      if (missing > 0) {
        const at = missing - 1;
        // INFO: Read before the slice, and only an object costs a key — the empty line's anchor stands after a newline, which owns none.
        const index = countObjectPlaceholders(next.slice(0, at));
        const isObject = next[at] === OBJECT_PLACEHOLDER;

        next = `${next.slice(0, at)}${next.slice(at + 1)}`;

        if (isObject) {
          keys = [...keys.slice(0, index), ...keys.slice(index + 1)];
        }

        placeAt = at;
      }
    }

    if (maxLength !== undefined && next.length > maxLength && !isComposingRef.current) {
      next = next.slice(0, maxLength);
      // WARN: The keys the trimmed text still has placeholders for, and the rewrite carries them — writing the text alone would draw every surviving object as the raw placeholder character.
      keys = keys.slice(0, countObjectPlaceholders(next));
      placeAt = caret;
    }

    /**
     * WARN: The DOM is put back the way `writeNodes` spells it whenever the browser's own
     * editing has left it spelled differently — a stray anchor where the object it belonged to
     * is gone, or a missing one this press has just been credited for. Left alone, the next
     * Backspace lands on a character that stands for nothing again.
     *
     * WARN: Never while a composition is in flight, for the reason the sync effect above skips
     * one: replacing the nodes a Hangul IME owns settles the syllable twice.
     */
    if (!isComposingRef.current && (placeAt !== null || raw !== toAnchored(next))) {
      writeNodes(field, next, keys.map(toHostedObject));

      const at = placeAt ?? caret;

      if (at !== null && document.activeElement === field) {
        placeCaret(field, Math.min(at, next.length));
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

  // INFO: `pointerdown` rather than `click`, because focus is handled by the press and this has to be on record before it.
  function rememberPress(event: PointerEvent<HTMLDivElement>) {
    pressRef.current = { x: event.clientX, y: event.clientY, at: Date.now() };
    takeFocusWithoutPan(event);
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

  /**
   * WARN: The press is consulted before `caretRef`, and a draft of nothing but objects is
   * why. `writeNodes` gives an empty run no text node, so three minis in a row are three
   * `contenteditable="false"` spans with no editable text anywhere between them — WebKit
   * sets no selection at all for a tap that lands on one, `isCaretInside` is false, and the
   * remembered caret then puts every such tap back where the last insertion left it: the
   * end of the draft. Reading the tap's own coordinates is what makes the middle reachable.
   */
  function restoreCaret(field: HTMLDivElement, selection: Selection) {
    const pressed = toPressedCaret(field, pressRef.current);

    pressRef.current = null;

    if (pressed) {
      selection.removeAllRanges();
      selection.addRange(pressed);

      return;
    }

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

    // WARN: Stripped, for the reason the `beforeinput` guard strips it.
    const replaced = toStripped(document.getSelection()?.toString() ?? "").length;
    // WARN: Floored at zero. A `value` written in from outside is never trimmed, so a draft past the limit leaves a negative room — and `slice` counts one of those from the *end*, pasting the clipboard's tail where the refusal was meant to be.
    const room =
      maxLength === undefined
        ? undefined
        : Math.max(0, maxLength - shownRef.current.length + replaced);
    // WARN: The placeholder is stripped out of pasted text. It would be a character the caller has no object for — one the draft counts, the limit charges for, and nothing draws.
    // WARN: And the anchor with it, or a draft copied out of this very field would paste anchors standing after no object — which `report` then reads as objects deleted and starts removing.
    const text = toStripped(event.clipboardData.getData("text/plain"))
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

/**
 * The caret a press at these coordinates asks for, or null when there is no fresh press to
 * read one out of.
 *
 * WARN: A press that landed on an object is snapped to one side of it rather than used as
 * it comes back. `caretRangeFromPoint` reports a position *inside* the host for a tap on
 * the picture, which is a place the caret may not stand — the host is
 * `contenteditable="false"` — so WebKit resolves it to whichever end of the field it likes.
 * The half of the box that was tapped is what says which side the reader meant.
 */
function toPressedCaret(
  field: HTMLDivElement,
  press: Nullable<{ x: number; y: number; at: number }>,
): Nullable<Range> {
  if (!press || Date.now() - press.at > PRESS_FRESHNESS) {
    return null;
  }

  const range = toRangeFromPoint(press.x, press.y);

  if (!range || !field.contains(range.startContainer)) {
    return null;
  }

  const host = toEnclosingHost(range.startContainer);

  if (!host) {
    range.collapse(true);

    return range;
  }

  const box = host.getBoundingClientRect();
  const snapped = document.createRange();

  if (press.x < box.left + box.width / 2) {
    snapped.setStartBefore(host);
  } else {
    snapped.setStartAfter(host);
  }

  snapped.collapse(true);

  return snapped;
}

// WARN: `caretRangeFromPoint` is the WebKit/Blink spelling and the one iOS answers; `caretPositionFromPoint` is the standardised name Firefox ships. Neither is on every engine, so both are tried.
function toRangeFromPoint(x: number, y: number): Nullable<Range> {
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y);
  }

  const position = document.caretPositionFromPoint?.(x, y);

  if (!position) {
    return null;
  }

  const range = document.createRange();

  range.setStart(position.offsetNode, position.offset);

  return range;
}

/** The object host `node` sits in, if it sits in one at all. */
function toEnclosingHost(node: Node): Nullable<HTMLElement> {
  const element = node instanceof HTMLElement ? node : node.parentElement;

  return element?.closest<HTMLElement>(`[${OBJECT_KEY_ATTRIBUTE}]`) ?? null;
}

/**
 * Whether the field's content ends in a `<br>` — the other shape the browser's last-line filler
 * comes in, and the one `toAtoms` has already dropped by the time `report` reads the text.
 *
 * WARN: The deepest last child, not `lastChild`. A browser that answered the break by splitting
 * the field into blocks puts its filler inside the final one.
 */
function endsWithBreakElement(field: HTMLDivElement): boolean {
  let node: Nullable<Node> = field.lastChild;

  while (node?.lastChild) {
    node = node.lastChild;
  }

  return node instanceof HTMLElement && node.tagName === "BR";
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
  /**
   * The hosts already standing in the field, so an object that survives this write keeps the
   * element it was drawn into.
   *
   * WARN: Reused rather than rebuilt, and the normalisation in `report` is why it matters now:
   * that runs on every Enter, and a fresh host each time is React unmounting and remounting
   * every emoticon — `PreloadImage`, its `<img>`, and the deferred skeleton with it — once per
   * newline. `replaceChildren` moves an existing element rather than copying it, so the portal
   * inside goes on living and `isSameHosts` finds nothing to re-render.
   */
  const standing = new Map(
    toHosts(field).map((host) => [host.getAttribute(OBJECT_KEY_ATTRIBUTE) ?? "", host]),
  );

  runs.forEach((run, index) => {
    const isLast = index === runs.length - 1;
    // WARN: Prepended to the run rather than pushed as a node of its own, so the text after an object is one node whose first character is the anchor — two adjacent text nodes are one the browser may merge and one it may not, and the readers below would have to agree with both.
    const lead = index === 0 ? run : `${CARET_ANCHOR}${run}`;
    // WARN: Appended inside the same node, for that reason again. An anchor of its own on the empty line would leave the caret at the end of the *previous* node, which is the box it was painting against to begin with.
    const content = isLast && text.endsWith("\n") ? `${lead}${CARET_ANCHOR}` : lead;

    if (content) {
      nodes.push(document.createTextNode(content));
    }

    if (!isLast) {
      const key = objects[index]?.key ?? "";
      const kept = standing.get(key);

      // WARN: Taken out of the map on use, so a key the caller has twice cannot put one element in two places — a node moved to its second position would silently vanish from its first.
      standing.delete(key);
      nodes.push(kept ?? toObjectHost(key));
    }
  });

  field.replaceChildren(...nodes);
}

/** `text` as the field's DOM spells it — the one statement of where a `CARET_ANCHOR` belongs. */
function toAnchored(text: string): string {
  const anchored = text.replaceAll(OBJECT_PLACEHOLDER, `${OBJECT_PLACEHOLDER}${CARET_ANCHOR}`);

  return text.endsWith("\n") ? `${anchored}${CARET_ANCHOR}` : anchored;
}

/** `value` with every `CARET_ANCHOR` removed — the text the draft actually holds. */
function toStripped(value: string): string {
  return value.replaceAll(CARET_ANCHOR, "");
}

/**
 * The raw index into `value` of its `strippedOffset`-th character, counting past any
 * `CARET_ANCHOR` on the way.
 *
 * WARN: Leading anchors are skipped rather than landed on, which is what puts the caret
 * *after* the anchor that follows an object. Landed in front of it, the next character typed
 * would go in before the anchor and every keystroke beside an object would need the DOM
 * rewritten to put the two back in order.
 */
function toRawIndex(value: string, strippedOffset: number): number {
  let seen = 0;

  for (let index = 0; index < value.length; index += 1) {
    if (value[index] === CARET_ANCHOR) {
      continue;
    }

    if (seen === strippedOffset) {
      return index;
    }

    seen += 1;
  }

  return value.length;
}

/**
 * Where a `CARET_ANCHOR` the DOM should be holding has gone, counted as the draft reads, or
 * `-1` when none is missing.
 *
 * INFO: That anchor is the character a Backspace beside an object — or on an empty last line —
 * reaches first, so its absence is how a press meant for the character *before* it is recognised
 * after the fact. Deleting the anchor alone is not an edit the reader can see, which is why the
 * press has to be credited to something.
 *
 * WARN: `-1` for a raw form that diverges on real content too. That is an edit which already
 * reported itself — a selection swept over the object, say — and needs only the normalisation.
 */
function toMissingAnchor(raw: string, text: string): number {
  const canonical = toAnchored(text);
  let at = 0;
  let stripped = 0;

  for (const expected of canonical) {
    if (expected === CARET_ANCHOR) {
      if (raw[at] !== CARET_ANCHOR) {
        return stripped;
      }

      at += 1;
      continue;
    }

    // INFO: Any anchor the raw form holds where canonical wants none is a stray, left behind by whatever took the character it used to follow; stepping over it lets the comparison reach the real divergence.
    while (raw[at] === CARET_ANCHOR) {
      at += 1;
    }

    if (raw[at] !== expected) {
      return -1;
    }

    at += 1;
    stripped += 1;
  }

  return -1;
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

/** Where the caret sits, counted in the same text `readEditableContent` reports. */
function toCaretOffset(field: HTMLDivElement): Nullable<number> {
  const selection = document.getSelection();

  return selection && selection.rangeCount > 0
    ? toRangeOffset(field, selection.getRangeAt(0))
    : null;
}

/**
 * Where `range` ends, in that same text.
 *
 * WARN: Measured by reading a clone of everything ahead of it rather than by
 * `Range.toString()`, which drops the newlines the blocks around it stand for — and the
 * objects, which it reports as nothing at all. Off by one per line or per object, the
 * restored caret drifts a character further back on each of them.
 */
function toRangeOffset(field: HTMLElement, range: Range): Nullable<number> {
  if (!field.contains(range.endContainer)) {
    return null;
  }

  const ahead = document.createRange();

  ahead.selectNodeContents(field);
  ahead.setEnd(range.endContainer, range.endOffset);

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
      const value = atom.node.nodeValue ?? "";
      // WARN: Counted stripped, since `CARET_ANCHOR` is not a character of the draft — raw lengths would drift the caret one further back per object it passed.
      const length = toStripped(value).length;

      if (remaining <= length) {
        range.setStart(atom.node, toRawIndex(value, remaining));
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
function readEditableContent(root: Node): { text: string; raw: string; keys: string[] } {
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

  // INFO: `raw` keeps the anchors, and is only ever compared against `toAnchored` to tell whether the DOM still spells the draft the way `writeNodes` would.
  const raw = parts.join("");

  return { text: toStripped(raw), raw, keys };
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
      /**
       * WARN: A `<br>` is the browser's own filler whenever nothing *inline* follows it — the end
       * of its parent, or a block that starts the next line itself. Read as a break either way it
       * appends a newline the user never typed, and the second case is how iOS answers Enter:
       * `insertParagraph` leaves `<br>` beside `<div><br></div>`, which paints two lines, where
       * counting both the `<br>` and the block gave three.
       *
       * WARN: A filler still marks that a line exists, or the block after it is taken for the
       * first one and yields no break at all — that `<br>` is the empty first line's whole content.
       */
      const following = child.nextSibling;
      const isFiller =
        following === null ||
        (following instanceof HTMLElement && BLOCK_TAGS.has(following.tagName));

      state.hasEmitted = true;

      if (!isFiller) {
        yield { kind: "break", node: child };
      }

      continue;
    }

    if (BLOCK_TAGS.has(child.tagName)) {
      if (state.hasEmitted) {
        yield { kind: "break", node: child };
      }

      /**
       * WARN: A block counts as content even when it is empty, and nothing else here would say
       * so — only a text node or an object used to set this, and an empty block holds neither.
       * Chrome answers Enter on a field whose DOM this component has never written by splitting
       * it into blocks, so a first break gives `<div><br></div><div><br></div>`: every `<br>` is
       * its block's last child and skipped as filler, `hasEmitted` never turns true, and the
       * second block's newline is dropped along with it. The draft then reads empty while the
       * browser paints two lines — and because that reports no change, the normalisation below
       * never runs to put the DOM back, so the two stay out of step until something else edits.
       */
      state.hasEmitted = true;
      yield* toAtoms(child, state);
      continue;
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
