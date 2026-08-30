import { cn } from "@/shared/lib";

export type AllPacksIconProps = {
  className?: string;
};

export function AllPacksIcon({ className }: AllPacksIconProps) {
  return (
    <svg
      className={cn("size-7 text-meta", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      // INFO: 1.25 in a 24 viewBox drawn at size-7 lands on the same 1.46px as the strip's size-5 lucide icons at 1.75.
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1" y="3" width="22" height="18" rx="3.5" />
      <text
        x="12"
        y="15.75"
        fill="currentColor"
        stroke="none"
        fontSize="10.5"
        fontWeight="600"
        textAnchor="middle"
        fontFamily="inherit"
      >
        ALL
      </text>
    </svg>
  );
}
