/**
 * `canvas` in each theme, for the iOS status bar and the Android browser chrome.
 *
 * WARN: Literal hex, and the one place AGENTS.md § 5.1. cannot apply — a `<meta>`
 * content attribute is read by the OS, not by CSS, so it can hold no `var()`. These
 * two MUST be kept in step with `--color-canvas` in `theme.css` by hand.
 */
export const THEME_COLOR = {
  light: "#fbf9f6",
  dark: "#16130f",
} as const;
