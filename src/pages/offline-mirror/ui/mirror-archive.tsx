"use client";

import type { ArchiveMedia } from "@/entities/media";
import type { ArchiveSnapshot, ArchiveSnapshotKey } from "@/features/offline-snapshot";
import { cn } from "@/shared/lib";
import { OFFLINE_MESSAGES, OFFLINE_NOTICE_ID } from "@/shared/offline-ux";
import { useSnapshot } from "@/shared/snapshot";
import {
  AppHeader,
  Container,
  FileCard,
  IconButton,
  TwoPane,
  VoicePlayer,
  toast,
} from "@/shared/ui";
import { OfflineSegments, SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { AudioLines, Files, ImagePlus, Images, LayoutGrid, ListChecks } from "lucide-react";
import type { ComponentProps, FC } from "react";
import { toMirrorCell } from "../model/to-mirror-cell";
import { type MirrorSection, toMirrorSections } from "../model/to-mirror-sections";
import { MirrorLoading } from "./mirror-loading";
import { MirrorMediaBox } from "./mirror-media-box";

/** Which shelf is mirrored — the three `MirrorScreen`s that read 보관함's snapshots. */
export type MirrorShelf = "gallery" | "files" | "voice";

export type MirrorArchiveProps = {
  className?: string;
  shelf: MirrorShelf;
};

type ShelfFace = {
  key: ArchiveSnapshotKey;
  subject: string;
  Icon: FC<ComponentProps<"svg">>;
};

// WARN: `subject` is what is missing rather than what the shelf is called — `갤러리를 아직 받아두지 못했어요` says the screen never arrived, where it is the photos that did not.
const SHELVES: Record<MirrorShelf, ShelfFace> = {
  gallery: { key: "archive-gallery", subject: "사진", Icon: Images },
  files: { key: "archive-files", subject: "파일", Icon: Files },
  voice: { key: "archive-voice", subject: "음성", Icon: AudioLines },
};

function toMonthSectionId(monthKey: string): string {
  return `archive-month-${monthKey}`;
}

/**
 * 보관함's three shelves as they were last received (REQUIREMENTS.md § 16.).
 *
 * INFO: One component for all three, as the live screens are three of one shape —
 * what differs is the row, which is the only thing branched on below.
 *
 * WARN: Nothing here is virtualized. A snapshot is one page (§ 10.'s `ARCHIVE_PAGE_SIZE`), which is the size the live shelves render before the first scroll anyway.
 */
export function MirrorArchive({ className, shelf }: MirrorArchiveProps) {
  const face = SHELVES[shelf];
  const snapshot = useSnapshot<ArchiveSnapshot>(face.key);
  const sections = snapshot.status === "hit" ? toMirrorSections(snapshot.payload.media) : [];

  return (
    <TwoPane
      className={className}
      // INFO: AGENTS.md § 4.1., DESIGN.md § 7.20. The chip switcher and a 월 이동 list built off the same sections the grid below groups into — `ArchiveShell`'s panel, minus its query for the shelf's true total.
      panel={
        <div className="flex flex-col gap-md p-md">
          <OfflineSegments screen={shelf} variant="pill" />
          {snapshot.status === "loading" && <MirrorLoading variant="months" />}
          {sections.length > 0 && (
            <nav className="flex flex-col gap-2xs" aria-label="월 이동">
              {sections.map((section) => (
                <button
                  key={section.monthKey}
                  className="flex cursor-pointer items-center justify-between gap-sm rounded-md px-sm py-xs text-left text-body-sm text-body transition-colors outline-none hover:bg-surface-soft focus-visible:ring-2 focus-visible:ring-primary active:bg-surface-strong"
                  type="button"
                  onClick={() => jumpToMonth(section)}
                >
                  {section.label}
                  <span className="min-w-5 shrink-0 rounded-full bg-surface-soft px-2xs text-center text-caption text-meta">
                    {section.media.length}
                  </span>
                </button>
              ))}
            </nav>
          )}
        </div>
      }
    >
      <AppHeader
        containerClassName="max-w-none"
        hasSidePanel
        title="보관함"
        // INFO: DESIGN.md § 7.19. The live header's controls, drawn and refusing rather than withdrawn — 열 개수 and 선택 are reads of a grid this document holds only a snapshot of.
        trailing={
          <>
            <IconButton
              variant="floating"
              Icon={LayoutGrid}
              haptic
              aria-label="열 개수"
              aria-disabled
              aria-describedby={OFFLINE_NOTICE_ID}
              onClick={() => toast(OFFLINE_MESSAGES.change)}
            />
            <IconButton
              variant="floating"
              Icon={ImagePlus}
              haptic
              aria-label="갤러리 추가"
              aria-disabled
              aria-describedby={OFFLINE_NOTICE_ID}
              onClick={() => toast(OFFLINE_MESSAGES.upload)}
            />
            <IconButton
              variant="floating"
              Icon={ListChecks}
              haptic
              aria-label="선택"
              aria-disabled
              aria-describedby={OFFLINE_NOTICE_ID}
              onClick={() => toast(OFFLINE_MESSAGES.select)}
            />
          </>
        }
      />
      <Container className="flex max-w-none flex-col px-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-[var(--bottom-inset,0px)]">
        {/* INFO: AGENTS.md § 4.1. `lg`'s panel carries the vertical version — below it this stays the chip row. */}
        <OfflineSegments className="pb-sm lg:hidden" screen={shelf} />
        {snapshot.status === "loading" && (
          <MirrorLoading variant={shelf === "gallery" ? "grid" : "rows"} />
        )}
        {snapshot.status === "miss" && <SnapshotEmpty Icon={face.Icon} subject={face.subject} />}
        {snapshot.status === "hit" && (
          <div className="flex flex-col gap-md">
            <SnapshotStamp savedAt={snapshot.savedAt} />
            {sections.map((section) => (
              // INFO: DESIGN.md § 7.9. `scroll-mt` and the id are what the panel's 월 이동 buttons scroll to and clear the floating header by.
              <section
                key={section.monthKey}
                className="scroll-mt-(--app-header-inset)"
                id={toMonthSectionId(section.monthKey)}
              >
                <h2 className="pb-xs text-title-sm text-meta">{section.label}</h2>
                <div
                  className={cn(
                    shelf === "gallery" ? "grid grid-cols-3 gap-2xs" : "flex flex-col gap-2xs",
                  )}
                >
                  {section.media.map(renderRow)}
                </div>
              </section>
            ))}
          </div>
        )}
      </Container>
    </TwoPane>
  );

  function jumpToMonth(section: MirrorSection) {
    document.getElementById(toMonthSectionId(section.monthKey))?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }

  function renderRow(item: ArchiveMedia) {
    if (shelf === "gallery") {
      // INFO: A tile and not a control. The viewer it would open needs the object itself, which is never cached (§ 16.), so there is nothing behind the tap to offer.
      return (
        // WARN: The icon alone. A shelf draws nine of these at once, and the sentence repeated down the grid reads as a wall of type rather than as nine photos — `MirrorMediaBox` keeps it as the tile's `aria-label`.
        <MirrorMediaBox
          key={item.id}
          className="rounded-sm"
          cell={toMirrorCell(item)}
          isSquare
          isIconOnly
        />
      );
    }

    if (shelf === "voice") {
      // WARN: REQUIREMENTS.md § 9.3. `src` is null on purpose — the waveform and the running time are stored on the row, and only the clip itself is missing.
      return (
        <VoicePlayer
          key={item.id}
          src={null}
          durationMs={item.durationMs ?? 0}
          peaks={item.voice?.peaks ?? []}
          isMine={false}
        />
      );
    }

    return (
      // WARN: Refused unconditionally rather than through `useOfflineGate` — the object behind this row is never cached (§ 16.), so the tap has nothing to do even if the connection came back under the reader.
      <FileCard
        key={item.id}
        filename={item.filename ?? ""}
        sizeBytes={item.size}
        aria-describedby={OFFLINE_NOTICE_ID}
        aria-disabled
        onClick={() => toast(OFFLINE_MESSAGES.save)}
      />
    );
  }
}
