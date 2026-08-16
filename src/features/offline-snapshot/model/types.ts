import type { CalendarSummary, EventOccurrence } from "@/entities/event";
import type { ArchiveMedia } from "@/entities/media";
import type { ChatMessage } from "@/entities/message";
import type { Participant } from "@/entities/user";
import type { InlineEmoticonMap } from "@/shared/config";
import type { HolidayTable, MediaId, Nullable, UserId } from "@/shared/lib";
import type { SnapshotKey } from "@/shared/snapshot";

/** The three shelf keys, so a shelf writer cannot be handed `"chat"`. */
export type ArchiveSnapshotKey = Extract<SnapshotKey, `archive-${string}`>;

/**
 * The chrome every mirror draws, written by the `(main)` shell.
 *
 * INFO: The signed-in user's own profile row is `participants` keyed by `currentUserId` — `listUsers` has already applied REQUIREMENTS.md § 8.7.'s name fallback, so 설정's mirror needs nothing beyond this.
 */
export type ShellSnapshot = {
  participants: Participant[];
  currentUserId: UserId;
  chatBackgroundMediaId: Nullable<MediaId>;
  chatBackgroundBlurhash: Nullable<string>;
  hasEventToday: boolean;
};

/** What the mirror hands `buildChatRows`, with no pending queue of its own. */
export type ChatSnapshot = {
  messages: ChatMessage[];
  /**
   * REQUIREMENTS.md § 13. What the emoticons written into those messages are, narrowed
   * to the ids the stored transcript names — this is § 2.4.'s map on the one delivery
   * path that outlives the page it arrived on.
   *
   * WARN: Optional because it is read from whatever an **earlier build** wrote, which is
   * the only shape a restore ever sees (`StoredPendingMessage` records the same rule).
   * The writer's own argument is required, so no new caller can leave it out.
   */
  emoticons?: InlineEmoticonMap;
};

export type CalendarSnapshot = {
  summary: CalendarSummary;
  monthKey: string;
  occurrences: EventOccurrence[];
  /** REQUIREMENTS.md § 11.7. Whole, exactly as the live screen takes it — a mirror resolves its 빨간 날 without asking for anything either. */
  holidays: HolidayTable;
};

export type ArchiveSnapshot = {
  media: ArchiveMedia[];
};
