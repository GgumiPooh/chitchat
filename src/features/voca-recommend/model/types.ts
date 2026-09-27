export type VocaRecommendTag =
  "전체" | "토익" | "수능" | "공무원" | "비즈니스" | "일상 회화" | "IT/개발";

export type VocaRecommendGrade = "essential" | "core" | "killer";

export type VocaRecommendItem = {
  targetWord: string;
  pos: string;
  koreanMeaning: string;
};

export type VocaWordGenerationStatus = "idle" | "loading" | "added" | "failed";
