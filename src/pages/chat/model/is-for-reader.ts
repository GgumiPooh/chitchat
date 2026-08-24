import type { EventOccurrence } from "@/entities/event";
import type { UserId } from "@/shared/lib";

/**
 * REQUIREMENTS.md § 11.5.1. Whether an event is the reader's own to be interrupted
 * by — a 우리 일정, or a 개인 일정 they wrote themselves.
 *
 * INFO: § 11.5. The other person's 개인 일정 stays on the list to be read; what this
 * withholds is the panel opening itself over a conversation and the header blooming.
 */
export function isForReader({ event }: EventOccurrence, readerId: UserId): boolean {
  return event.scope === "shared" || event.createdBy === readerId;
}
