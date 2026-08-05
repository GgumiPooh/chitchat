/** DESIGN.md § 8.1. permits hex only inside a CSS filter function, and each site must be marked. */
export type MediaFilter = {
  label: string;
  /** A CSS `filter` value, used both for the live preview and for the canvas export. */
  value: string;
  id: string;
};

export const MEDIA_FILTERS: MediaFilter[] = [
  { id: "none", label: "원본", value: "none" },
  { id: "warm", label: "따뜻하게", value: "saturate(1.15) sepia(0.18) contrast(1.03)" },
  { id: "cool", label: "차갑게", value: "saturate(1.05) hue-rotate(-10deg) brightness(1.03)" },
  { id: "vivid", label: "선명하게", value: "saturate(1.4) contrast(1.12)" },
  { id: "faded", label: "은은하게", value: "saturate(0.85) contrast(0.92) brightness(1.06)" },
  { id: "mono", label: "흑백", value: "grayscale(1) contrast(1.05)" },
];

export const DEFAULT_FILTER = MEDIA_FILTERS[0];

export function findFilter(id: string): MediaFilter {
  return MEDIA_FILTERS.find((filter) => filter.id === id) ?? DEFAULT_FILTER;
}
