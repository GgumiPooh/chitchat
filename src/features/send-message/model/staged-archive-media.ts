import type { ArchiveMedia } from "@/entities/media";

/**
 * REQUIREMENTS.md § 10. 채팅으로 보내기's handoff — 보관함 calls `stageArchiveMedia`
 * just before navigating to chat, and the composer takes the list once on mount.
 *
 * WARN: Module-level rather than a store passed down through props or context.
 * Nothing on the chat screen exists yet at the moment 보관함 calls this, and the
 * two screens are separate route trees with nothing else in common to hold it.
 */
let staged: ArchiveMedia[] = [];

export function stageArchiveMedia(items: ArchiveMedia[]): void {
  staged = items;
}

/** Consumed once by `useStagedMediaIntake` on mount; empty on every call after. */
export function takeStagedArchiveMedia(): ArchiveMedia[] {
  const items = staged;

  staged = [];

  return items;
}
