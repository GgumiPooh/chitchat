import type { Nullable, Optional } from "../nullish";

const EXTERNAL_AUTHOR_PREFIX_REGEX = /^\[작성자:\s*(.+?)\](?:\r?\n+|$)/;

export type ParsedEventMemo = {
  externalAuthor: Nullable<string>;
  memo: Nullable<string>;
};

export function formatExternalAuthorTag(authorName: string): string {
  return `[작성자: ${authorName}]`;
}

// INFO: REQUIREMENTS.md § 11.8. Strip Google Calendar observance/holiday settings boilerplate so system imports do not show noisy duplicate memos.
export function isGoogleSettingsBoilerplate(line: string): boolean {
  const lower = line.toLowerCase();
  const isKoreanBoilerplate =
    lower.includes("숨기려면") &&
    (lower.includes("google calendar") || lower.includes("google 캘린더")) &&
    lower.includes("설정");
  const isEnglishBoilerplate =
    lower.includes("to hide") &&
    (lower.includes("google calendar") || lower.includes("google 캘린더")) &&
    lower.includes("setting");

  return isKoreanBoilerplate || isEnglishBoilerplate;
}

export function cleanseEventMemo(raw: Optional<Nullable<string>>): Nullable<string> {
  if (!raw) {
    return null;
  }

  const withoutAuthor = raw.replace(EXTERNAL_AUTHOR_PREFIX_REGEX, "").trim();
  if (!withoutAuthor) {
    return null;
  }

  const cleaned = withoutAuthor
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !isGoogleSettingsBoilerplate(line))
    .join("\n")
    .trim();

  const lower = cleaned.toLowerCase();
  if (
    !cleaned ||
    cleaned === "기념일" ||
    cleaned === "공휴일" ||
    lower === "observance" ||
    lower === "public holiday" ||
    lower === "holiday"
  ) {
    return null;
  }

  return cleaned;
}

export function parseEventMemo(raw: Optional<Nullable<string>>): ParsedEventMemo {
  if (!raw) {
    return { externalAuthor: null, memo: null };
  }

  const match = raw.match(EXTERNAL_AUTHOR_PREFIX_REGEX);
  const externalAuthor = match ? match[1].trim() : null;
  const memo = cleanseEventMemo(raw);

  return { externalAuthor, memo };
}
