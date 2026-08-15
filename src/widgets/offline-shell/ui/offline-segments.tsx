import {
  ARCHIVE_FILES_ROUTE,
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_VOICE_ROUTE,
  LIBRARY_SHELF_LABELS,
  type LibraryShelf,
} from "@/shared/config";
import { cn } from "@/shared/lib";
import { Chip } from "@/shared/ui";
import type { MirrorScreen } from "../model/mirror-screen";

export type OfflineSegmentsProps = {
  className?: string;
  screen: MirrorScreen;
};

const SEGMENTS: { screen: MirrorScreen; shelf: LibraryShelf; href: string }[] = [
  { screen: "gallery", shelf: "gallery", href: ARCHIVE_GALLERY_ROUTE },
  { screen: "files", shelf: "file", href: ARCHIVE_FILES_ROUTE },
  { screen: "voice", shelf: "voice", href: ARCHIVE_VOICE_ROUTE },
];

/**
 * 보관함's three chips for the mirror (REQUIREMENTS.md § 10.).
 *
 * WARN: `LibrarySegments` cannot be reused here — it resolves the lit chip from
 * `usePathname()` at render, which this document has no valid answer for until an
 * effect has read the real path.
 */
export function OfflineSegments({ className, screen }: OfflineSegmentsProps) {
  return (
    <nav className={cn("flex gap-2xs", className)} aria-label="보관함 종류">
      {SEGMENTS.map((segment) => {
        const isSelected = segment.screen === screen;

        return (
          <Chip key={segment.shelf} asChild isSelected={isSelected}>
            {/* WARN: An anchor rather than `Link`, for the reason `OfflineTabBar` carries. */}
            <a href={segment.href} aria-current={isSelected ? "page" : undefined}>
              {LIBRARY_SHELF_LABELS[segment.shelf]}
            </a>
          </Chip>
        );
      })}
    </nav>
  );
}
