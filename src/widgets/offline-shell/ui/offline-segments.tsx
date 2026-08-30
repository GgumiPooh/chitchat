"use client";

import {
  ARCHIVE_FILES_ROUTE,
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_VOICE_ROUTE,
  LIBRARY_SHELF_LABELS,
  type LibraryShelf,
} from "@/shared/config";
import { cn, useRovingTabIndex } from "@/shared/lib";
import { Chip } from "@/shared/ui";
import type { MirrorScreen } from "../model/mirror-screen";

export type OfflineSegmentsProps = {
  className?: string;
  screen: MirrorScreen;
  /** AGENTS.md § 4.1. `pill` is the `lg` panel's own shape, as `LibrarySegments` draws it; everywhere else stays the chip row. */
  variant?: "chips" | "pill";
};

const SEGMENTS: { screen: MirrorScreen; shelf: LibraryShelf; href: string }[] = [
  { screen: "gallery", shelf: "gallery", href: ARCHIVE_GALLERY_ROUTE },
  { screen: "files", shelf: "file", href: ARCHIVE_FILES_ROUTE },
  { screen: "voice", shelf: "voice", href: ARCHIVE_VOICE_ROUTE },
];

/**
 * 보관함's three chips for the mirror (REQUIREMENTS.md § 10.), in both of
 * `LibrarySegments`' shapes — DESIGN.md § 7.19. keeps the segments untouched offline.
 *
 * WARN: `LibrarySegments` cannot be reused here — it resolves the lit chip from
 * `usePathname()` at render, which this document has no valid answer for until an
 * effect has read the real path.
 */
export function OfflineSegments({ className, screen, variant = "chips" }: OfflineSegmentsProps) {
  const handleKeyDown = useRovingTabIndex({
    orientation: "horizontal",
    selector: "[data-library-segment]",
  });

  if (variant === "pill") {
    const activeIndex = SEGMENTS.findIndex((segment) => segment.screen === screen);

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
              {SEGMENTS.map((segment, index) => {
                const isSelected = segment.screen === screen;

                return (
                  <li key={segment.shelf} className="flex-1">
                    {/* WARN: An anchor rather than `Link`, for the reason `OfflineTabBar` carries. */}
                    <a
                      className="flex size-full min-h-9 items-center justify-center rounded-full text-button-sm whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                      href={segment.href}
                      tabIndex={isSelected || (activeIndex < 0 && index === 0) ? 0 : -1}
                      data-library-segment=""
                      aria-current={isSelected ? "page" : undefined}
                    >
                      <span
                        className={cn(
                          "transition-colors duration-(--duration-tab-travel) motion-reduce:duration-0",
                          isSelected ? "text-primary" : "text-meta",
                        )}
                      >
                        {LIBRARY_SHELF_LABELS[segment.shelf]}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </nav>
    );
  }

  return (
    <nav className={cn("flex gap-2xs", className)} aria-label="보관함 종류">
      {SEGMENTS.map((segment) => {
        const isSelected = segment.screen === screen;

        return (
          <Chip key={segment.shelf} asChild isSelected={isSelected} haptic={!isSelected}>
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
