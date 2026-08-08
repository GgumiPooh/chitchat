"use client";

import {
  MAX_EMOTICON_KEYWORDS,
  MAX_EMOTICON_KEYWORD_LENGTH,
  normalizeKeywords,
} from "@/shared/config";
import { cn } from "@/shared/lib";
import { X } from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import { Chip } from "./chip";
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
 * chips. Committed on Enter or a comma, removed by the chip's own `×`.
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
  const isFull = keywords.length >= MAX_EMOTICON_KEYWORDS;
  // INFO: `normalizeKeywords` drops anything shorter, so the field says why rather than swallowing the entry — one character is unsearchable by § 13.8.'s own floor.
  const isTooShort = draft.trim().length === 1;

  return (
    <div className={cn("space-y-2xs", className)}>
      <p className={cn("text-title-sm text-ink", labelClassName)}>{label}</p>
      <p className={cn("text-body-sm", isTooShort ? "text-semantic-warning" : "text-meta")}>
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
        <Input
          className="min-h-11"
          value={draft}
          maxLength={MAX_EMOTICON_KEYWORD_LENGTH}
          placeholder="우와, 놀람"
          disabled={isDisabled}
          enterKeyHint="done"
          aria-label={label}
          onChange={(event) => handleChange(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commit(draft)}
        />
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
    const next = normalizeKeywords([...keywords, ...value.split(",")]);

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
