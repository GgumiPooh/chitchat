// INFO: The FSD cross-import gate. `entities/time-letter` loads attached media, so it needs these symbols from `media`.
export { insertMedia, type ValidatedMedia } from "../api/insert-media";
export { toChatMedia } from "../model/to-chat-media";
export type { ChatMedia } from "../model/types";
export { mediaUploadSchema, type MediaUpload } from "../model/upload";
