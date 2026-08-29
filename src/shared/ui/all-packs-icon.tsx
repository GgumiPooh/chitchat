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
      strokeWidth="1.5"
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
        fontWeight="700"
        textAnchor="middle"
        fontFamily="inherit"
      >
        ALL
      </text>
    </svg>
  );
}
