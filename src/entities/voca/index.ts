export {
  createVocaCard as createCard,
  createVocaCard,
  type CreateVocaCardInput,
} from "./api/create-card";
export { deleteVocaCard as deleteCard, deleteVocaCard } from "./api/delete-card";
export { generateVocaCard, type GeneratedVocaCard } from "./api/generate-voca-card";
export { countAheadCards, getAheadCards } from "./api/get-ahead-cards";
export { getVocaCard as getCard, getVocaCard } from "./api/get-card";
export { getDueCards, type DueCardsResult } from "./api/get-due-cards";
export { getVocaHeatmap as getHeatmap, getVocaHeatmap } from "./api/get-heatmap";
export {
  getVocaUserSettings as getUserSettings,
  getVocaUserSettings,
} from "./api/get-user-settings";
export {
  listVocaCards as listCards,
  listVocaCards,
  type ListVocaCardsOptions,
  type ListVocaCardsResult,
} from "./api/list-cards";
export {
  recommendVocaWords,
  type RecommendVocaOptions,
  type RecommendedVocaItem,
} from "./api/recommend-voca-words";
export { revertVocaReview as revertReview, revertVocaReview } from "./api/revert-review";
export {
  submitVocaReview as submitReview,
  submitVocaReview,
  type SubmitVocaReviewInput,
  type SubmitVocaReviewResult,
} from "./api/submit-review";
export { synthesizeVocaAudio, type SynthesizedVocaAudio } from "./api/synthesize-voca-audio";
export {
  updateVocaCard as updateCard,
  updateVocaCard,
  type UpdateVocaCardInput,
} from "./api/update-card";
export {
  updateVocaUserSettings as updateUserSettings,
  updateVocaUserSettings,
  type UpdateVocaUserSettingsInput,
} from "./api/update-user-settings";
export { Rating, State } from "./model/fsrs-adapter";
export { VOCA_ROLLOVER_HOUR, toVocaSessionDayKey, toVocaSessionStart } from "./model/time-boundary";
export { toVocaHeatmapLevel } from "./model/types";

// WARN: Everything above touches the database or server. A client module may import from this barrel with `import type` only — a value import drags `server-only` into its bundle.
export type {
  VocaCard,
  VocaCardState,
  VocaDueSummary,
  VocaHeatmapDay,
  VocaRatingValue,
  VocaReviewLog,
  VocaUserSettings,
} from "./model/types";
