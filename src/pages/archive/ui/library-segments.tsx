"use client";

import {
  ARCHIVE_FILES_ROUTE,
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_VOICE_ROUTE,
  LIBRARY_SHELF_LABELS,
  type LibraryShelf,
} from "@/shared/config";
import { cn, usePendingTab, useRovingTabIndex, type Nullable } from "@/shared/lib";
import { Chip, Link } from "@/shared/ui";
import { usePathname } from "next/navigation";

export type LibrarySegmentsProps = {
  className?: string;
  /**
   * AGENTS.md § 4.1. `pill` is the `lg` panel's own shape — a
   * travelling fill on a glass track, `tab-bar.tsx`'s technique turned into a
   * segmented control. Everywhere else stays the chip row.
   */
  variant?: "chips" | "pill";
};

// INFO: REQUIREMENTS.md § 10. Ordered by how much of the conversation each holds, so the one opened most often is the one the thumb lands on first.
// WARN: The names come from `LIBRARY_SHELF_LABELS` rather than being written out here — that table is read by the upload's "landed elsewhere" toast and by the staging sheet's title too, and a chip renamed on its own leaves both naming a shelf the user cannot see.
const SEGMENTS: { shelf: LibraryShelf; href: string }[] = [
  { shelf: "gallery", href: ARCHIVE_GALLERY_ROUTE },
  { shelf: "file", href: ARCHIVE_FILES_ROUTE },
  { shelf: "voice", href: ARCHIVE_VOICE_ROUTE },
];

/**
 * 보관함's 갤러리 / 파일 / 음성 segments (REQUIREMENTS.md § 10.).
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
export function LibrarySegments({ className, variant = "chips" }: LibrarySegmentsProps) {
  // WARN: Read from the URL, never passed down from the page. A prop only changes once the new page has rendered, which is after the server has answered — the tapped chip stayed unlit for the whole round trip. The router commits the pathname as soon as the navigation starts, so this lights up on the tap. `SegmentPill` below reads it differently — see its own WARN.
  const active = toActiveShelf(usePathname());

  if (variant === "pill") {
    return <SegmentPill className={className} />;
  }

  return (
    <nav className={cn("flex gap-2xs", className)} aria-label="보관함 종류">
      {SEGMENTS.map(({ shelf, href }) => {
        const isSelected = shelf === active;

        return (
          <Chip key={shelf} asChild isSelected={isSelected} haptic={!isSelected}>
            <Link href={href} aria-current={isSelected ? "page" : undefined}>
              {LIBRARY_SHELF_LABELS[shelf]}
            </Link>
          </Chip>
        );
      })}
    </nav>
  );
}

type SegmentPillProps = {
  className?: string;
};

/**
 * AGENTS.md § 4.1. The `lg` panel's shelf switcher — a pill segmented
 * control on the same glass track and travelling fill as `TabBar` (§ DESIGN.md 7.3.),
 * turned into three equal `Link`s rather than the app's own four tabs.
 *
 * WARN: `archive/layout.tsx` mounts this once and keeps it mounted across every
 * shelf route — that persistence is the whole reason `translate` has something to
 * transition *from*. `usePendingTab` on top of that is what moves the fill on the
 * tap rather than the commit, exactly as `TabBar`/`NavRail` do for the four app tabs.
 */
function SegmentPill({ className }: SegmentPillProps) {
  const pathname = usePathname();
  const { pendingTab, setPendingTab } = usePendingTab(pathname);
  const activePath = pendingTab?.route ?? pathname;
  const active = toActiveShelf(activePath);
  const activeIndex = SEGMENTS.findIndex((segment) => segment.shelf === active);
  const handleKeyDown = useRovingTabIndex({
    orientation: "horizontal",
    selector: "[data-library-segment]",
  });

  return (
    <nav className={cn("flex", className)} aria-label="보관함 종류">
      <div className="flex flex-1 items-stretch rounded-full border border-hairline glass p-2xs">
        <div className="relative flex flex-1 items-stretch" onKeyDown={handleKeyDown}>
          {activeIndex >= 0 && (
            <span
              className="pointer-events-none absolute inset-y-0 left-0 rounded-full bg-primary-tint transition-[translate] duration-(--duration-tab-travel) ease-route motion-reduce:duration-0"
              aria-hidden="true"
              style={{
                width: `calc(100% / ${SEGMENTS.length})`,
                translate: `${activeIndex * 100}% 0`,
              }}
            />
          )}
          <ul className="relative z-10 flex flex-1 items-stretch">
            {SEGMENTS.map(({ shelf, href }, index) => {
              const isSelected = shelf === active;

              return (
                <li key={shelf} className="flex-1">
                  <Link
                    className="flex size-full min-h-9 items-center justify-center rounded-full text-button-sm whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                    href={href}
                    tabIndex={isSelected || (activeIndex < 0 && index === 0) ? 0 : -1}
                    haptic={!isSelected}
                    // WARN: Not a `ref` — `Link` wraps `next/link` with no `ref` in its props type, so roving tabindex reads the DOM through this attribute and `querySelectorAll` instead (REQUIREMENTS.md § 8.14.).
                    data-library-segment=""
                    aria-current={isSelected ? "page" : undefined}
                    // INFO: DESIGN.md § 7.3. Held for the round trip, exactly as `TabBar`'s own `Link` — the fill moves on the tap, not when the route commits.
                    onNavigate={() => setPendingTab(href)}
                  >
                    <span
                      className={cn(
                        "transition-colors duration-(--duration-tab-travel) motion-reduce:duration-0",
                        isSelected ? "text-primary" : "text-meta",
                      )}
                    >
                      {LIBRARY_SHELF_LABELS[shelf]}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}

/**
 * WARN: Each route is matched **exactly**, never by prefix. `ARCHIVE_ROUTE` is a
 * prefix of all three, so a `startsWith` test would light whichever chip was declared
 * first on every shelf.
 *
 * INFO: The bare `/archive` answers 갤러리 as well, for the instant before its
 * redirect to `ARCHIVE_GALLERY_ROUTE` lands (§ 10.) — unhandled, all three chips
 * would sit unlit for that instant.
 */
export function toActiveShelf(pathname: Nullable<string>): LibraryShelf {
  if (pathname === ARCHIVE_FILES_ROUTE) {
    return "file";
  }

  if (pathname === ARCHIVE_VOICE_ROUTE) {
    return "voice";
  }

  return "gallery";
}
