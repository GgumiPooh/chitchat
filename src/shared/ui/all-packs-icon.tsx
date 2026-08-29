import { cn } from "@/shared/lib";

export type AllPacksIconProps = {
  className?: string;
};

export function AllPacksIcon({ className }: AllPacksIconProps) {
  return (
    <svg
      className={cn("size-5 text-meta", className)}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="3" />
      <text
        x="12"
        y="15.5"
        fill="currentColor"
        stroke="none"
        fontSize="8"
        fontWeight="700"
        textAnchor="middle"
        fontFamily="inherit"
      >
        ALL
      </text>
    </svg>
  );
}
