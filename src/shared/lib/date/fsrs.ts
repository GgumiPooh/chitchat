import type { Nullable } from "@/shared/lib";
import { createEmptyCard, fsrs, generatorParameters, Rating, State, type Card } from "ts-fsrs";

export { Rating, State } from "ts-fsrs";

export type VocaCardState = "new" | "learning" | "review" | "relearning";

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

export function toFsrsCard(card: {
  dueAt: Nullable<Date | string>;
  difficulty: number;
  lapses: number;
  reps: number;
  stability: number;
  state: string;
}): Card {
  const empty = createEmptyCard();
  const due = card.dueAt ? new Date(card.dueAt) : new Date();

  return {
    ...empty,
    due,
    stability: card.stability > 0 ? card.stability : empty.stability,
    difficulty: card.difficulty > 0 ? card.difficulty : empty.difficulty,
    reps: card.reps,
    lapses: card.lapses,
    state: toFsrsState(card.state),
  };
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
  const diffMinutes = Math.max(1, Math.round(diffMs / (60 * 1000)));

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
  scheduledDays: number;
  intervalString: string;
};

export function computeNextReview(
  card: {
    dueAt: Nullable<Date | string>;
    difficulty: number;
    lapses: number;
    reps: number;
    stability: number;
    state: string;
  },
  rating: Rating,
  desiredRetention = 0.9,
  now: Date = new Date(),
): ReviewComputationResult {
  const f = fsrs(generatorParameters({ request_retention: desiredRetention }));
  const fsrsCard = toFsrsCard(card);
  const result = f.repeat(fsrsCard, now);
  const item = result[rating as 1 | 2 | 3 | 4];
  const nextCard = item.card;
  const state = fromFsrsState(nextCard.state);
  const intervalString = formatIntervalString(nextCard.due, now, nextCard.scheduled_days);

  return {
    dueAt: nextCard.due,
    stability: nextCard.stability,
    difficulty: nextCard.difficulty,
    state,
    reps: nextCard.reps,
    lapses: nextCard.lapses,
    scheduledDays: nextCard.scheduled_days,
    intervalString,
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
  card: {
    dueAt: Nullable<Date | string>;
    difficulty: number;
    lapses: number;
    reps: number;
    stability: number;
    state: string;
  },
  desiredRetention = 0.9,
  now: Date = new Date(),
): Record<Rating, RatingIntervalInfo> {
  const f = fsrs(generatorParameters({ request_retention: desiredRetention }));
  const fsrsCard = toFsrsCard(card);
  const result = f.repeat(fsrsCard, now);

  const ratings: { label: string; rating: Rating }[] = [
    { rating: Rating.Again, label: "다시" },
    { rating: Rating.Hard, label: "어려움" },
    { rating: Rating.Good, label: "알맞음" },
    { rating: Rating.Easy, label: "쉬움" },
  ];

  const map = {} as Record<Rating, RatingIntervalInfo>;

  for (const { label, rating } of ratings) {
    const item = result[rating as 1 | 2 | 3 | 4];
    const nextCard = item.card;
    const nextState = fromFsrsState(nextCard.state);
    const intervalString = formatIntervalString(nextCard.due, now, nextCard.scheduled_days);

    map[rating] = {
      rating,
      label,
      intervalString,
      scheduledDays: nextCard.scheduled_days,
      nextState,
    };
  }

  return map;
}
