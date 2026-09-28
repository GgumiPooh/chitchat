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
  { id: "kraft", label: "빈티지", description: "빛바랜 종이처럼 따뜻하고 아날로그한 양식" },
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
    headerBadge: "bg-canvas/80 text-primary border border-primary/30",
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
      "bg-parchment-midnight border border-hairline/20 text-parchment-midnight-ink shadow-sm",
    headerBadge:
      "bg-parchment-midnight-card text-parchment-midnight-ink/85 border border-hairline/25",
    title: "text-parchment-midnight-ink",
    body: "text-parchment-midnight-ink/90",
    dateStamp: "text-parchment-midnight-ink/60",
    divider: "border-hairline/15",
    waxSeal: "bg-primary text-on-primary",
    waxSealShadow: "shadow-md shadow-ink/40",
    accent: "text-primary",
  },
  kraft: {
    parchment: "bg-surface-soft border border-hairline-strong text-ink shadow-sm",
    headerBadge: "bg-surface-strong/70 text-ink border border-hairline-strong",
    title: "text-ink",
    body: "text-body",
    dateStamp: "text-meta",
    divider: "border-hairline-strong/60",
    waxSeal: "bg-primary text-on-primary",
    waxSealShadow: "shadow-md shadow-primary/20",
    accent: "text-primary",
  },
};

export function formatJourneyDuration(ms: number): string {
  if (ms <= 0) {
    return "";
  }
  const totalMinutes = Math.max(1, Math.round(ms / 60000));
  if (totalMinutes < 60) {
    return `${totalMinutes}분간의 시간 여행`;
  }
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  if (totalHours < 24) {
    return remainingMinutes > 0
      ? `${totalHours}시간 ${remainingMinutes}분간의 시간 여행`
      : `${totalHours}시간 동안의 시간 여행`;
  }
  const totalDays = Math.floor(totalHours / 24);
  const remainingHours = totalHours % 24;
  if (totalDays < 365) {
    return remainingHours > 0
      ? `${totalDays}일 ${remainingHours}시간 동안의 시간 여행`
      : `${totalDays}일 동안의 시간 여행`;
  }
  const years = Math.floor(totalDays / 365);
  const remainingDays = totalDays % 365;
  return remainingDays > 0
    ? `${years}년 ${remainingDays}일 동안의 시간 여행`
    : `${years}년 동안의 시간 여행`;
}
