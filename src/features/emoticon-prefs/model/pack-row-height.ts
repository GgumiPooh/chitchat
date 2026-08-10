/**
 * REQUIREMENTS.md § 13.5. The height of one pack row, as a number and as the class
 * that produces it.
 *
 * WARN: The two are one fact and have to stay together. The 이모티콘그룹 검색 tab is
 * windowed and never measures a row (`EmoticonPackBrowser`), so every offset in a
 * ten-thousand-row list is summed from this number — a class changed without it slides
 * the whole list out from under its own geometry.
 *
 * INFO: 64 is `border-box`: the row's 1px rule plus `py-xs` twice leaves 47 for the
 * tallest thing in it, which is the name block — `title-md` at 1.45 over `body-sm` at
 * 1.55 is 43.35 — with the 44px thumbnail beside it inside the same 47.
 */
export const EMOTICON_PACK_ROW_HEIGHT = 64;

export const EMOTICON_PACK_ROW_HEIGHT_CLASS = "h-16";
