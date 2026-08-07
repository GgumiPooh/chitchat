import { GALLERY_FILES_ROUTE, GALLERY_ROUTE, type LibraryKind } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Chip, Link } from "@/shared/ui";

export type LibrarySegmentsProps = {
  className?: string;
  active: LibraryKind;
};

const SEGMENTS: { kind: LibraryKind; label: string; href: string }[] = [
  { kind: "photo", label: "사진", href: GALLERY_ROUTE },
  { kind: "file", label: "파일", href: GALLERY_FILES_ROUTE },
];

/**
 * 보관함's 사진 / 파일 segments (REQUIREMENTS.md § 10.).
 *
 * INFO: Chips rather than an underlined segmented control. The tab bar right below
 * already runs a fill that travels between items (DESIGN.md § 7.3.), and a second
 * travelling indicator one strip above it reads as two things moving at once — and
 * a row of chips takes a third segment (음성) without the line having to be re-divided.
 *
 * WARN: Links, not buttons. Each segment is its own route (§ 10.), so the browser's
 * back button walks between them and the pair is announced as navigation rather than
 * as a form control that changes nothing in the URL.
 */
export function LibrarySegments({ className, active }: LibrarySegmentsProps) {
  return (
    <nav className={cn("flex gap-2xs", className)} aria-label="보관함 종류">
      {SEGMENTS.map(({ kind, label, href }) => {
        const isSelected = kind === active;

        return (
          <Chip key={kind} asChild isSelected={isSelected} haptic={!isSelected}>
            <Link href={href} aria-current={isSelected ? "page" : undefined}>
              {label}
            </Link>
          </Chip>
        );
      })}
    </nav>
  );
}
