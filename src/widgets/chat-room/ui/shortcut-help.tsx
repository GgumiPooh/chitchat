"use client";

import { toCommandKeyLabel } from "@/shared/lib";
import { Modal } from "@/shared/ui";

export type ShortcutHelpProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
};

/**
 * REQUIREMENTS.md § 8.14. What `⌘/` opens: the conversation's keyboard shortcuts,
 * which are otherwise discoverable from nothing on screen.
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

  return (
    <Modal
      className={className}
      isOpen={isOpen}
      size="md"
      header={{ title: "단축키" }}
      onClose={onClose}
    >
      <div className="flex flex-col gap-md">
        {renderGroup("대화", [
          { keys: ["Esc"], label: "메시지 입력창으로" },
          { keys: ["Enter"], label: "메시지 입력창으로 (아무것도 선택하지 않았을 때)" },
          { keys: [command, "↓"], label: "최신 메시지로" },
          { keys: [command, "/"], label: "단축키 보기" },
        ])}
        {renderGroup("이모티콘", [
          { keys: [command, "E"], label: "이모티콘 검색 열기" },
          { keys: ["←", "→", "↑", "↓"], label: "이모티콘 사이 이동" },
          { keys: ["↓"], label: "맨 아래에서 한 번 더 누르면 묶음 탭으로" },
          { keys: ["←", "→"], label: "묶음 탭에서 이전 / 다음 묶음" },
          { keys: ["↑"], label: "묶음 탭에서 다시 이모티콘으로" },
          { keys: ["Enter"], label: "담기" },
          { keys: [command, "Enter"], label: "바로 보내기" },
          { keys: ["Esc"], label: "닫기" },
        ])}
      </div>
    </Modal>
  );

  function renderGroup(title: string, rows: { keys: string[]; label: string }[]) {
    return (
      <section className="space-y-2xs">
        <h3 className="text-caption text-meta-soft">{title}</h3>
        <ul className="space-y-2xs">
          {rows.map((row) => (
            // INFO: The keys lead and the sentence follows, so the column of caps reads as a list a user scans for the key they half-remember.
            <li key={row.label} className="flex items-center gap-xs">
              <span className="flex shrink-0 items-center gap-2xs">
                {row.keys.map((key) => (
                  <kbd
                    key={key}
                    className="inline-flex min-w-7 items-center justify-center rounded-sm border border-hairline bg-surface-soft px-2xs py-0.5 text-caption text-meta"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
              <span className="min-w-0 text-body-sm text-body">{row.label}</span>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}
