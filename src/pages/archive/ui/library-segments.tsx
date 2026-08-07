"use client";

import {
  ARCHIVE_FILES_ROUTE,
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_VOICE_ROUTE,
  type LibraryKind,
} from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { Chip, Link } from "@/shared/ui";
import { usePathname } from "next/navigation";

export type LibrarySegmentsProps = {
  className?: string;
};

// INFO: REQUIREMENTS.md § 10. Ordered by how much of the conversation each holds, so the one opened most often is the one the thumb lands on first.
const SEGMENTS: { kind: LibraryKind; label: string; href: string }[] = [
  { kind: "photo", label: "사진", href: ARCHIVE_GALLERY_ROUTE },
  { kind: "file", label: "파일", href: ARCHIVE_FILES_ROUTE },
  { kind: "voice", label: "음성", href: ARCHIVE_VOICE_ROUTE },
];

/**
 * 보관함's 사진 / 파일 / 음성 segments (REQUIREMENTS.md § 10.).
 *
 * INFO: Chips rather than an underlined segmented control. The tab bar right below
 * already runs a fill that travels between items (DESIGN.md § 7.3.), and a second
 * travelling indicator one strip above it reads as two things moving at once — and
 * a row of chips took the third segment (음성) without the line being re-divided.
 *
 * WARN: Links, not buttons. Each segment is its own route (§ 10.), so the browser's
 * back button walks between them and the pair is announced as navigation rather than
 * as a form control that changes nothing in the URL.
 */
export function LibrarySegments({ className }: LibrarySegmentsProps) {
  // WARN: Read from the URL, never passed down from the page. A prop only changes once the new page has rendered, which is after the server has answered — the tapped chip stayed unlit for the whole round trip. The router commits the pathname as soon as the navigation starts, so this lights up on the tap.
  const active = toActiveKind(usePathname());

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

/**
 * WARN: Each route is matched **exactly**, never by prefix. `ARCHIVE_ROUTE` is a
 * prefix of all three, so a `startsWith` test would light whichever chip was declared
 * first on every shelf.
 *
 * INFO: The bare `/archive` answers 사진 as well. It only ever exists for the instant
 * before its redirect to `ARCHIVE_GALLERY_ROUTE` lands (§ 10.), and the `loading.tsx`
 * that covers that instant renders these chips — unhandled, all three would sit unlit
 * and the strip would flicker empty on the way in.
 */
function toActiveKind(pathname: Nullable<string>): LibraryKind {
  if (pathname === ARCHIVE_FILES_ROUTE) {
    return "file";
  }

  if (pathname === ARCHIVE_VOICE_ROUTE) {
    return "voice";
  }

  return "photo";
}
