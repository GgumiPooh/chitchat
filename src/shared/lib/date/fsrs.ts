import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  GenSeedStrategyWithCardId,
  Rating,
  State,
  StrategyMode,
  type Card,
  type FSRS,
  type Grade,
  type RecordLog,
} from "ts-fsrs";
import type { Nullable } from "../nullish";
import { A_DAY, A_MINUTE, AN_HOUR, TIME_ZONE_OFFSET_MS } from "./time";

export { Rating, State } from "ts-fsrs";

export type VocaCardState = "new" | "learning" | "review" | "relearning";

export const FSRS_ROLLOVER_HOUR = 4;

// INFO: REQUIREMENTS.md § 17.1. ts-fsrs counts elapsed days between UTC midnights — 09:00 KST — where Anki counts them between rollovers. Every instant is moved by this much on the way in and back on the way out, so a UTC date in scheduler time reads as a session day.
const SESSION_DAY_SHIFT_MS = TIME_ZONE_OFFSET_MS - FSRS_ROLLOVER_HOUR * AN_HOUR;

const CARD_ID_FIELD = "card_id";

export type SchedulableCard = {
  dueAt: Nullable<Date | string>;
  lastReviewedAt?: Nullable<Date | string>;
  learningSteps?: number;
  difficulty: number;
  lapses: number;
  reps: number;
  stability: number;
  state: string;
  id: string;
};

export function toFsrsState(state: string): State {
  switch (state) {
    case "learning":
      return State.Learning;
    case "review":
      return State.Review;
    case "relearning":
      return State.Relearning;
    default:
      return State.New;
  }
}

export function fromFsrsState(state: State): VocaCardState {
  switch (state) {
    case State.Learning:
      return "learning";
    case State.Review:
      return "review";
    case State.Relearning:
      return "relearning";
    default:
      return "new";
  }
}

const schedulers = new Map<number, FSRS>();

function schedulerFor(desiredRetention: number): FSRS {
  const cached = schedulers.get(desiredRetention);
  if (cached) {
    return cached;
  }

  // WARN: REQUIREMENTS.md § 17.1. Fuzz is seeded by card id, not review time — a time seed makes the rating bar preview a different interval from the one the server then stores.
  const scheduler = fsrs(
    generatorParameters({ request_retention: desiredRetention, enable_fuzz: true }),
  ).useStrategy(StrategyMode.SEED, GenSeedStrategyWithCardId(CARD_ID_FIELD));
  schedulers.set(desiredRetention, scheduler);

  return scheduler;
}

function toSchedulerTime(date: Date | string): Date {
  return new Date(new Date(date).getTime() + SESSION_DAY_SHIFT_MS);
}

function fromSchedulerTime(date: Date): Date {
  return new Date(date.getTime() - SESSION_DAY_SHIFT_MS);
}

function toFsrsCard(card: SchedulableCard, now: Date): Card & { [CARD_ID_FIELD]: string } {
  const empty = createEmptyCard();
  // WARN: ts-fsrs throws on a negative elapsed time, which an offline review synced after a later online one, or a client clock behind the server's, would otherwise hand it.
  const lastReviewedAt = card.lastReviewedAt
    ? new Date(Math.min(new Date(card.lastReviewedAt).getTime(), now.getTime()))
    : undefined;

  return {
    ...empty,
    [CARD_ID_FIELD]: card.id,
    due: toSchedulerTime(card.dueAt ?? now),
    last_review: lastReviewedAt ? toSchedulerTime(lastReviewedAt) : undefined,
    learning_steps: card.learningSteps ?? 0,
    stability: card.stability > 0 ? card.stability : empty.stability,
    difficulty: card.difficulty > 0 ? card.difficulty : empty.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: toFsrsState(card.state),
  };
}

// INFO: Anki stores a day interval as a day number and surfaces the card at that day's rollover, not at the minute it was last answered.
function toDueAt(next: Card): Date {
  if (next.scheduled_days < 1) {
    return fromSchedulerTime(next.due);
  }

  return fromSchedulerTime(new Date(Math.floor(next.due.getTime() / A_DAY) * A_DAY));
}

function preview(card: SchedulableCard, desiredRetention: number, now: Date): RecordLog {
  return schedulerFor(desiredRetention).repeat(toFsrsCard(card, now), toSchedulerTime(now));
}

export function formatIntervalString(due: Date, now: Date = new Date(), scheduledDays = 0): string {
  if (scheduledDays >= 365) {
    const years = (scheduledDays / 365).toFixed(1).replace(/\.0$/, "");
    return `${years}년`;
  }

  if (scheduledDays >= 30) {
    const months = Math.round(scheduledDays / 30);
    return `${months}개월`;
  }

  if (scheduledDays >= 1) {
    return `${scheduledDays}일`;
  }

  const diffMs = due.getTime() - now.getTime();
  const diffMinutes = Math.max(1, Math.round(diffMs / A_MINUTE));

  if (diffMinutes <= 10) {
    return "< 10분";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}분`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours}시간`;
  }

  return "1일";
}

export type ReviewComputationResult = {
  dueAt: Date;
  stability: number;
  difficulty: number;
  state: VocaCardState;
  reps: number;
  lapses: number;
  learningSteps: number;
  scheduledDays: number;
  intervalString: string;
};

export function computeNextReview(
  card: SchedulableCard,
  rating: Rating,
  desiredRetention = 0.9,
  now: Date = new Date(),
): ReviewComputationResult {
  const next = preview(card, desiredRetention, now)[rating as Grade].card;
  const dueAt = toDueAt(next);

  return {
    dueAt,
    stability: next.stability,
    difficulty: next.difficulty,
    state: fromFsrsState(next.state),
    reps: next.reps,
    lapses: next.lapses,
    learningSteps: next.learning_steps,
    scheduledDays: next.scheduled_days,
    intervalString: formatIntervalString(dueAt, now, next.scheduled_days),
  };
}

export type RatingIntervalInfo = {
  rating: Rating;
  label: string;
  intervalString: string;
  scheduledDays: number;
  nextState: VocaCardState;
};

export function computeAllNextIntervals(
  card: SchedulableCard,
  desiredRetention = 0.9,
  now: Date = new Date(),
): Record<Rating, RatingIntervalInfo> {
  const result = preview(card, desiredRetention, now);

  const ratings: { label: string; rating: Grade }[] = [
    { rating: Rating.Again, label: "다시" },
    { rating: Rating.Hard, label: "어려움" },
    { rating: Rating.Good, label: "보통" },
    { rating: Rating.Easy, label: "쉬움" },
  ];

  const map = {} as Record<Rating, RatingIntervalInfo>;

  for (const { label, rating } of ratings) {
    const next = result[rating].card;

    map[rating] = {
      rating,
      label,
      intervalString: formatIntervalString(toDueAt(next), now, next.scheduled_days),
      scheduledDays: next.scheduled_days,
      nextState: fromFsrsState(next.state),
    };
  }

  return map;
}
