import "server-only";

import type { Nullable } from "@/shared/lib";

const PLATFORM_PATTERNS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Macintosh/, "Mac"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
];

const BROWSER_PATTERNS: [RegExp, string][] = [
  [/Edg\//, "Edge"],
  [/OPR\//, "Opera"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

function match(patterns: [RegExp, string][], userAgent: string): Nullable<string> {
  return patterns.find(([pattern]) => pattern.test(userAgent))?.[1] ?? null;
}

/** Label for the device list in Settings (REQUIREMENTS.md § 12.), e.g. `iPhone · Safari`. */
export function toDeviceLabel(userAgent: Nullable<string>): Nullable<string> {
  if (!userAgent) {
    return null;
  }

  const parts = [match(PLATFORM_PATTERNS, userAgent), match(BROWSER_PATTERNS, userAgent)].filter(
    Boolean,
  );

  return parts.length > 0 ? parts.join(" · ") : null;
}
