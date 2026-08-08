"use client";

import {
  MAX_EMOTICON_KEYWORDS,
  MAX_EMOTICON_KEYWORD_LENGTH,
  MIN_KEYWORD_LENGTH,
  normalizeKeywords,
} from "@/shared/config";
import { cn } from "@/shared/lib";
import { Plus, X } from "lucide-react";
import { useId, useState, type KeyboardEvent, type PointerEvent } from "react";
import { Chip } from "./chip";
import { IconButton } from "./icon-button";
import { Input } from "./input";

export type KeywordFieldProps = {
  className?: string;
  labelClassName?: string;
  label?: string;
  description?: string;
  keywords: string[];
  isDisabled?: boolean;
  onChange: (keywords: string[]) => void;
};

/**
 * REQUIREMENTS.md § 13.8. The words an item answers to in the composer, entered as
 * chips. Committed by the `+` beside the field, by Enter or by a comma, and removed
 * by the chip's own `×`.
 *
 * WARN: The commit is guarded on `isComposing`. A Korean field fires `keydown` for
 * the Enter that *closes* the IME's composition, so without the guard the first
 * Enter after typing `우와` commits `우` — the syllable the composer had settled —
 * and swallows the keystroke that was finishing the word.
 */
export function KeywordField({
  className,
  labelClassName,
  label = "검색 키워드",
  description = "선택 · 채팅 입력창에서 이 단어로 찾을 수 있어요",
  keywords,
  isDisabled = false,
  onChange,
}: KeywordFieldProps) {
  const [draft, setDraft] = useState("");
  const descriptionId = useId();
  const trimmedDraft = draft.trim();
  const isFull = keywords.length >= MAX_EMOTICON_KEYWORDS;
  // INFO: `MIN_KEYWORD_LENGTH`, said out loud rather than swallowing the entry. It is a floor on the stored word alone — typing one character in the composer searches fine (§ 13.8.), so the copy must not read as "one character cannot be searched".
  const isTooShort = trimmedDraft.length > 0 && trimmedDraft.length < MIN_KEYWORD_LENGTH;

  return (
    <div className={cn("space-y-2xs", className)}>
      <p className={cn("text-title-sm text-ink", labelClassName)}>{label}</p>
      {/* INFO: `role="alert"` on the warning alone. The line it replaces is the answer to a `+` that has just refused, and a screen reader is otherwise told only that nothing happened. */}
      {/* WARN: Never `aria-invalid` on the field with it. That is what DESIGN.md § 7.2. keys the error styling off, and this is a warning the user is mid-way through resolving rather than a value that was rejected. */}
      <p
        className={cn("text-body-sm", isTooShort ? "text-semantic-warning" : "text-meta")}
        role={isTooShort ? "alert" : undefined}
        id={descriptionId}
      >
        {isTooShort ? "두 글자부터 넣을 수 있어요" : description}
      </p>
      {keywords.length > 0 && (
        <ul className="flex flex-wrap gap-2xs pt-2xs">
          {keywords.map((keyword) => (
            <li key={keyword} className="inline-flex">
              <Chip
                chipClassName="h-8 gap-2xs pr-2xs pl-3"
                haptic
                type="button"
                disabled={isDisabled}
                aria-label={`${keyword} 지우기`}
                onClick={() => remove(keyword)}
              >
                {keyword}
                <X className="size-3.5 shrink-0" strokeWidth={2} />
              </Chip>
            </li>
          ))}
        </ul>
      )}
      {/* INFO: Withheld at the cap rather than disabled — a field that takes no more text reads as broken, where its absence beside a full row reads as the limit it is. */}
      {!isFull && (
        <div className="flex gap-2xs">
          <Input
            className="min-h-11 flex-1"
            value={draft}
            maxLength={MAX_EMOTICON_KEYWORD_LENGTH}
            placeholder="우와, 놀람"
            disabled={isDisabled}
            enterKeyHint="done"
            aria-label={label}
            aria-describedby={descriptionId}
            onChange={(event) => handleChange(event.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => commit(draft)}
          />
          {/* INFO: § 13.8. What a thumb has instead of the two key commits — a Hangul keyboard keeps the comma behind its symbol layer, and the return key beside it only commits on the second press, since the first is the one the guard above swallows. */}
          {/* WARN: `keepsFocus` repeats `keepFieldFocused` on the overlay, exactly as the composer's send disc carries both — the overlay takes the tap the button would have taken, so without it the field blurs and iOS drops the keyboard between one keyword and the next. */}
          {/* WARN: An `IconButton` rather than a labelled `Button`, and not only to leave the sheet's own 추가 unambiguous — `Button`'s overlay is `keepsScroll`, and this one's `disabled` settles inside its own click, which is exactly the pairing DESIGN.md § 7.15.3. measured going silent. */}
          {/* WARN: Disabled on an *empty* draft, never on a short one. A disabled control receives no `pointerdown` and `IconButton` drops the overlay with it, so both focus guards go — the tap lands on the wrapper, the field blurs, and the word the warning above is asking the user to finish is committed away by `onBlur`. */}
          <IconButton
            Icon={Plus}
            haptic
            keepsFocus
            disabled={isDisabled || trimmedDraft.length === 0}
            aria-label="키워드 추가"
            onPointerDown={keepFieldFocused}
            onClick={() => commit(draft)}
          />
        </div>
      )}
    </div>
  );

  /** INFO: A comma is a separator rather than a character, so pasting `우와, 놀람` lands as two chips. */
  function handleChange(value: string) {
    if (!value.includes(",")) {
      setDraft(value);

      return;
    }

    const parts = value.split(",");

    commit(parts.slice(0, -1).join(","));
    setDraft(parts[parts.length - 1]?.trim() ?? "");
  }

  // WARN: Cancelling `pointerdown` is what stops the tap from blurring the field; `click` still fires, so the commit is untouched.
  function keepFieldFocused(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    // WARN: The IME's own Enter. Committing here takes the half-finished syllable and eats the keystroke that was completing it.
    if (event.nativeEvent.isComposing) {
      return;
    }

    if (event.key === "Enter") {
      // INFO: The sheet's submit is a sibling button rather than a form default, but preventing this keeps a future form from submitting on a keyword.
      event.preventDefault();
      commit(draft);

      return;
    }

    // INFO: Backspace on an empty field takes the last chip back, which is the one gesture a chip row is expected to answer.
    if (event.key === "Backspace" && draft === "") {
      const last = keywords[keywords.length - 1];

      if (last !== undefined) {
        remove(last);
      }
    }
  }

  function commit(value: string) {
    const entered = normalizeKeywords(value.split(","));

    // WARN: A word `normalizeKeywords` refuses stays in the box. Clearing it deletes the very text `두 글자부터 넣을 수 있어요` is asking the user to finish, and the blur behind a tap on `+` is the commit that would do it.
    if (entered.length === 0 && value.trim().length > 0) {
      return;
    }

    const next = normalizeKeywords([...keywords, ...entered]);

    setDraft("");

    // INFO: A duplicate or an all-whitespace entry normalizes away to the list already held, and writing it back would re-render every chip for nothing.
    if (next.length !== keywords.length) {
      onChange(next);
    }
  }

  function remove(keyword: string) {
    onChange(keywords.filter((held) => held !== keyword));
  }
}
