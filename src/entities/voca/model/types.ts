import type { VocaCardRow, VocaUserSettingsRow } from "@/shared/db";
import type { MediaId, Nullable, UserId, VocaCardId, VocaReviewId } from "@/shared/lib";

export type VocaCardState = "new" | "learning" | "review" | "relearning";

export type VocaRatingValue = 1 | 2 | 3 | 4;

export type VocaCard = {
  userId: UserId;
  state: VocaCardState;
  dueAt: Nullable<Date>;
  dueDate: Nullable<string>;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  suspended: boolean;
  sentence: string;
  targetWord: string;
  pos: string;
  pronunciation: string;
  koreanMeaning: string;
  englishDefinition: string;
  confusable: Nullable<string>;
  collocations: string;
  wordFamily: Nullable<string>;
  examples: string[];
  audioUrl: Nullable<string>;
  sentenceAudioUrl: Nullable<string>;
  audioMediaId: Nullable<MediaId>;
  sentenceAudioMediaId: Nullable<MediaId>;
  tags: Nullable<string>;
  deletedAt: Nullable<Date>;
  id: VocaCardId;
};

export type VocaUserSettings = {
  userId: UserId;
  dailyNewCards: number;
  dailyReviewLimit: Nullable<number>;
  reminderEnabled: boolean;
  lastRemindedDate: Nullable<string>;
  autoplayAudio: boolean;
  desiredRetention: number;
  todayExtraNewCards: number;
};

export type VocaReviewLog = {
  cardId: VocaCardId;
  userId: UserId;
  rating: number;
  stateBefore: string;
  stabilityBefore: number;
  difficultyBefore: number;
  stateAfter: string;
  stabilityAfter: number;
  difficultyAfter: number;
  scheduledDays: number;
  timeSpentMs: number;
  reviewedAt: Date;
  id: VocaReviewId;
};

export type VocaHeatmapDay = {
  dayKey: string;
  count: number;
  level: number;
};

export type VocaDueSummary = {
  newCount: number;
  learningCount: number;
  reviewCount: number;
  totalDue: number;
};

export function parseVocaExamples(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item).trim()).filter(Boolean);
    }
  } catch {}

  return raw
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toVocaCard(row: VocaCardRow): VocaCard {
  return {
    id: row.id,
    userId: row.userId,
    state: row.state as VocaCardState,
    dueAt: row.dueAt,
    dueDate: row.dueDate,
    stability: row.stability,
    difficulty: row.difficulty,
    reps: row.reps,
    lapses: row.lapses,
    suspended: row.suspended,
    sentence: row.sentence,
    targetWord: row.targetWord,
    pos: row.pos,
    pronunciation: row.pronunciation,
    koreanMeaning: row.koreanMeaning,
    englishDefinition: row.englishDefinition,
    confusable: row.confusable,
    collocations: row.collocations,
    wordFamily: row.wordFamily,
    examples: parseVocaExamples(row.examples),
    audioUrl: row.audioUrl,
    sentenceAudioUrl: row.sentenceAudioUrl,
    audioMediaId: row.audioMediaId,
    sentenceAudioMediaId: row.sentenceAudioMediaId,
    tags: row.tags,
    deletedAt: row.deletedAt,
  };
}

export function toVocaUserSettings(row: VocaUserSettingsRow): VocaUserSettings {
  return {
    userId: row.userId,
    dailyNewCards: row.dailyNewCards,
    dailyReviewLimit: row.dailyReviewLimit,
    reminderEnabled: row.reminderEnabled,
    lastRemindedDate: row.lastRemindedDate,
    autoplayAudio: row.autoplayAudio,
    desiredRetention: row.desiredRetention,
    todayExtraNewCards: row.todayExtraNewCards,
  };
}

export function toVocaHeatmapLevel(count: number): number {
  if (count <= 0) {
    return 0;
  }
  if (count <= 5) {
    return 1;
  }
  if (count <= 15) {
    return 2;
  }
  if (count <= 30) {
    return 3;
  }
  return 4;
}
