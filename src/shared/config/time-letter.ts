/**
 * DESIGN.md § 7.22. Theme styles and options for Time Machine Letters.
 * WARN: Pure configuration — lives in shared/config so client components
 * can import theme styling without dragging database-touching entity modules.
 */
export const TIME_LETTER_THEMES_LIST = ["classic", "romantic", "midnight", "kraft"] as const;

export type TimeLetterTheme = (typeof TIME_LETTER_THEMES_LIST)[number];

export type ThemeOption = {
  label: string;
  description: string;
  id: TimeLetterTheme;
};

export const TIME_LETTER_THEMES: readonly ThemeOption[] = [
  { id: "classic", label: "클래식", description: "따뜻하고 단정한 기본 양식" },
  { id: "romantic", label: "로맨틱", description: "설레는 마음을 담은 핑크빛 양식" },
  { id: "midnight", label: "미드나잇", description: "깊은 밤 차분하게 적어 내려간 양식" },
  { id: "kraft", label: "크라프트", description: "빈티지하고 포근한 크라프트 양식" },
] as const;

export type ThemeStyles = {
  parchment: string;
  headerBadge: string;
  title: string;
  body: string;
  dateStamp: string;
  divider: string;
  waxSeal: string;
  waxSealShadow: string;
  accent: string;
};

export const THEME_STYLES: Record<TimeLetterTheme, ThemeStyles> = {
  classic: {
    parchment: "bg-canvas border border-hairline-strong text-ink shadow-sm",
    headerBadge: "bg-surface-soft text-meta border border-hairline",
    title: "text-ink",
    body: "text-body",
    dateStamp: "text-meta",
    divider: "border-hairline",
    waxSeal: "bg-primary text-on-primary",
    waxSealShadow: "shadow-md shadow-primary/20",
    accent: "text-primary",
  },
  romantic: {
    parchment: "bg-primary-tint/35 border border-primary/25 text-ink shadow-sm",
    headerBadge: "bg-primary-tint/70 text-primary border border-primary/30",
    title: "text-ink",
    body: "text-body",
    dateStamp: "text-primary/70",
    divider: "border-primary/20",
    waxSeal: "bg-primary text-on-primary",
    waxSealShadow: "shadow-md shadow-primary/25",
    accent: "text-primary",
  },
  midnight: {
    parchment:
      "bg-surface-soft-private border border-hairline/20 text-bubble-private-ink shadow-sm",
    headerBadge: "bg-surface-soft-private/90 text-bubble-private-ink/80 border border-hairline/25",
    title: "text-bubble-private-ink",
    body: "text-bubble-private-ink/90",
    dateStamp: "text-bubble-private-ink/60",
    divider: "border-hairline/15",
    waxSeal: "bg-primary text-on-primary",
    waxSealShadow: "shadow-md shadow-ink/40",
    accent: "text-primary",
  },
  kraft: {
    parchment: "bg-surface-soft border border-hairline-strong text-ink shadow-sm",
    headerBadge: "bg-surface-soft-private/50 text-body border border-hairline",
    title: "text-ink",
    body: "text-body",
    dateStamp: "text-meta",
    divider: "border-hairline-strong/60",
    waxSeal: "bg-primary text-on-primary",
    waxSealShadow: "shadow-md shadow-primary/20",
    accent: "text-primary",
  },
};
