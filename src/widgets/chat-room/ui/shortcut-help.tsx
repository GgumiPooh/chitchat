"use client";

import { toAltKeyLabel, toCommandKeyLabel, toShiftKeyLabel } from "@/shared/lib";
import { Modal } from "@/shared/ui";
import { Fragment } from "react";

export type ShortcutHelpProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 8.14. One line of the sheet: the keys held together, then the one
 * or more keys any of which finishes the shortcut.
 *
 * INFO: The two are separate because they are joined differently — `+` says "at the
 * same time" and `or` says "either" — and a flat list of chips says neither. `⌥ + ↑ or
 * ↓` is one line where `⌥` `↑` `↓` was three glyphs a reader had to guess the grammar
 * of.
 */
type ShortcutRow = {
  /** Held down together. Empty for a shortcut that takes no modifier. */
  chord?: string[];
  keys: string[];
  label: string;
};

/**
 * REQUIREMENTS.md § 8.14. What `⌘/` opens: the conversation's keyboard shortcuts,
 * which are otherwise discoverable from nothing on screen but the composer's
 * placeholder.
 *
 * INFO: A `Modal` rather than DESIGN.md § 7.5.'s sheet, which is the app's default
 * overlay. A sheet is for something that started at the bottom of the screen or in a
 * list, and this starts nowhere on it — nothing here can be reached without a
 * hardware keyboard, so thumb reach, the whole argument for a sheet, does not apply.
 * It is a card to read and dismiss, which is § 7.4.'s `md`.
 */
export function ShortcutHelp({ className, isOpen, onClose }: ShortcutHelpProps) {
  // INFO: § 8.14. Read in the render rather than through a hook, because a closed `Modal` renders nothing at all — there is no server HTML for the label to disagree with.
  const command = toCommandKeyLabel();
  // INFO: § 8.14. One physical key, two names — `⌥` on a Mac and `Alt` everywhere else. `⇧`/`Shift` is the same, and a glyph nobody outside macOS reads is worse than no sheet at all.
  const alt = toAltKeyLabel();
  const shift = toShiftKeyLabel();

  return (
    <Modal
      className={className}
      isOpen={isOpen}
      size="md"
      header={{ title: "단축키" }}
      onClose={onClose}
    >
      <div className="flex flex-col gap-md">
        {/* INFO: § 8.14. `⌘/` is not listed. Anyone reading this has already pressed it, so the row taught nothing and cost a line of the few this has. */}
        {renderGroup("대화", [
          { chord: [alt], keys: ["↑", "↓"], label: "대화 스크롤" },
          { chord: [command], keys: ["↓"], label: "최신 메시지로" },
          { keys: ["Esc"], label: "메시지 입력창으로" },
          { keys: ["Enter"], label: "메시지 입력창으로 (아무것도 선택하지 않았을 때)" },
        ])}
        {/* INFO: § 8.14. The strip, the grid and the field are one surface to the reader, so the sheet names the arrows once rather than each edge between them — the edges are what the arrows do, not something to be learnt separately. */}
        {renderGroup("이모티콘", [
          { chord: [command], keys: ["E"], label: "이모티콘 패널 열기 / 닫기" },
          { chord: [command, shift], keys: ["E"], label: "이모티콘 검색" },
          { keys: ["←", "→", "↑", "↓"], label: "패널 안에서 이동" },
          // INFO: § 8.14. Named separately from the arrows above, because it is the one that works from anywhere in the panel rather than only at an edge — which is the whole reason it exists.
          { chord: [shift], keys: ["←", "→"], label: "이모티콘 묶음 넘기기" },
          { keys: ["Enter"], label: "담기, 두 번 누르면 보내기" },
          { keys: ["Esc"], label: "닫기, 담은 이모티콘 취소" },
        ])}
      </div>
    </Modal>
  );

  function renderGroup(title: string, rows: ShortcutRow[]) {
    return (
      <section className="space-y-2xs">
        <h3 className="text-caption text-meta-soft">{title}</h3>
        <ul className="space-y-2xs">
          {rows.map((row) => (
            // INFO: The keys lead and the sentence follows, so the column of caps reads as a list a user scans for the key they half-remember.
            <li key={row.label} className="flex items-center gap-xs">
              <span className="flex shrink-0 items-center gap-2xs">
                {row.chord?.map((key) => (
                  <Fragment key={key}>
                    {renderKey(key)}
                    {renderJoiner("+")}
                  </Fragment>
                ))}
                {row.keys.map((key, index) => (
                  <Fragment key={key}>
                    {index > 0 && renderJoiner("or")}
                    {renderKey(key)}
                  </Fragment>
                ))}
              </span>
              <span className="min-w-0 text-body-sm text-body">{row.label}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  function renderKey(key: string) {
    return (
      <kbd className="inline-flex min-w-7 items-center justify-center rounded-sm border border-hairline bg-surface-soft px-2xs py-0.5 text-caption text-meta">
        {key}
      </kbd>
    );
  }

  // INFO: Plain text and never a `kbd`, or the grammar between the keys reads as one more key to press.
  function renderJoiner(joiner: "+" | "or") {
    return <span className="text-caption text-meta-soft">{joiner}</span>;
  }
}
