"use client";

import type { ArchiveMedia } from "@/entities/media";
import type { ArchiveSnapshot, ArchiveSnapshotKey } from "@/features/offline-snapshot";
import { cn } from "@/shared/lib";
import { OFFLINE_MESSAGES, OFFLINE_NOTICE_ID } from "@/shared/offline-ux";
import { useSnapshot } from "@/shared/snapshot";
import { AppHeader, Container, FileCard, VoicePlayer, toast } from "@/shared/ui";
import { OfflineSegments, SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { AudioLines, Files, Images } from "lucide-react";
import type { ComponentProps, FC } from "react";
import { toMirrorCell } from "../model/to-mirror-cell";
import { toMirrorSections } from "../model/to-mirror-sections";
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
    <div className={className}>
      <AppHeader title="보관함" />
      <Container className="flex flex-col px-md pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-[var(--bottom-inset,0px)]">
        <OfflineSegments className="pb-sm" screen={shelf} />
        {snapshot.status === "loading" && <MirrorLoading />}
        {snapshot.status === "miss" && <SnapshotEmpty Icon={face.Icon} subject={face.subject} />}
        {snapshot.status === "hit" && (
          <div className="flex flex-col gap-md">
            <SnapshotStamp savedAt={snapshot.savedAt} />
            {sections.map((section) => (
              <section key={section.monthKey}>
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
    </div>
  );

  function renderRow(item: ArchiveMedia) {
    if (shelf === "gallery") {
      // INFO: A tile and not a control. The viewer it would open needs the object itself, which is never cached (§ 16.), so there is nothing behind the tap to offer.
      return (
        <MirrorMediaBox
          key={item.id}
          className="aspect-square rounded-sm"
          cell={toMirrorCell(item)}
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
