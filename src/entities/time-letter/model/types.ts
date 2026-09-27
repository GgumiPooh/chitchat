import type { ChatMedia } from "@/entities/media/@x/time-letter";
import type { TimeLetter as DbTimeLetter } from "@/shared/db";
import {
  idToDate,
  type MediaId,
  type MessageId,
  type Nullable,
  type TimeLetterId,
  type UserId,
} from "@/shared/lib";

export type TimeLetterTheme = "classic" | "romantic" | "midnight" | "kraft";

export type TimeLetterStatus = "scheduled" | "delivering" | "sent" | "canceled";

export type TimeLetterRecipientMode = "partner" | "both" | "me";

export type TimeLetterMedia = {
  previewUrl: string;
  originalUrl: string;
  downloadUrl: string;
  blurhash?: Nullable<string>;
  width?: Nullable<number>;
  height?: Nullable<number>;
  durationMs?: Nullable<number>;
  isVideo: boolean;
  id: MediaId;
};

export type TimeLetter = {
  senderId: UserId;
  senderName?: Nullable<string>;
  recipientId: Nullable<UserId>;
  title: Nullable<string>;
  content: Nullable<string>;
  theme: TimeLetterTheme;
  status: TimeLetterStatus;
  scheduledAt: string;
  sentAt: Nullable<string>;
  showTeaser: boolean;
  onlyMe: boolean;
  deliveredMessageId: Nullable<MessageId>;
  retryCount: number;
  createdAt: string;
  updatedAt: string;
  media: TimeLetterMedia[];
  id: TimeLetterId;
};

export type TimeLetterDraft = {
  title: string;
  content: string;
  theme: TimeLetterTheme;
  recipientMode: TimeLetterRecipientMode;
  showTeaser: boolean;
  scheduledDayKey?: string;
  scheduledTime?: string;
  scheduledAt?: string;
  savedAt?: number;
  mediaIds?: MediaId[];
};

export type TimeLetterInput = {
  recipientId?: Nullable<UserId>;
  title?: Nullable<string>;
  content: string;
  theme?: TimeLetterTheme;
  scheduledAt: Date | string;
  showTeaser?: boolean;
  onlyMe?: boolean;
  mediaIds?: MediaId[];
};

export function toTimeLetterMedia(m: ChatMedia): TimeLetterMedia {
  return {
    id: m.id,
    previewUrl: `/api/media/${m.id}?variant=preview`,
    originalUrl: `/api/media/${m.id}?variant=original`,
    downloadUrl: `/api/media/${m.id}?variant=original&download=1`,
    blurhash: m.blurhash,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    isVideo: m.mime.startsWith("video/"),
  };
}

// INFO: Maps raw database row to the domain TimeLetter, masking payload when recipient views a teaser.
export function toTimeLetter(
  row: DbTimeLetter,
  media: ChatMedia[] = [],
  isTeaserMasked: boolean = false,
  senderName?: Nullable<string>,
): TimeLetter {
  return {
    id: row.id,
    senderId: row.senderId,
    senderName: senderName ?? null,
    recipientId: row.recipientId,
    title: row.title,
    // WARN: When isTeaserMasked is true, content and media must be withheld to preserve surprise.
    content: isTeaserMasked ? null : row.content,
    theme: row.theme as TimeLetterTheme,
    status: row.status as TimeLetterStatus,
    scheduledAt: row.scheduledAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
    showTeaser: row.showTeaser,
    onlyMe: row.onlyMe,
    deliveredMessageId: row.deliveredMessageId,
    retryCount: row.retryCount,
    createdAt: idToDate(row.id).toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    media: isTeaserMasked ? [] : media.map(toTimeLetterMedia),
  };
}
