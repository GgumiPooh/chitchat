import type { Nullable } from "../nullish";

/**
 * Strips common markdown formatting (bold, italic, links, code, strikethrough, headers)
 * to produce clean plain text suitable for line-clamped previews and push notifications.
 */
export function stripMarkdown(markdown: Nullable<string>): string {
  if (!markdown) {
    return "";
  }
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*{1,3}|_{1,3})(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s*>\s+/gm, "")
    .replace(/^\s*#{1,6}\s+/gm, "")
    .replace(/^(?:[-*_]){3,}\s*$/gm, "")
    .trim();
}
