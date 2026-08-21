// INFO: The FSD cross-import gate. `entities/message` joins `message_media` onto its own rows, so it needs exactly these and nothing else from this slice.
export { toChatMedia } from "../model/to-chat-media";
export type { ArchiveMedia, ChatMedia } from "../model/types";
// INFO: `createMediaMessage` does the INSERT half of registration on its own transaction — the route resolves each upload with `validateMediaUpload` first and hands the result across this gate.
export { insertMedia } from "../api/insert-media";
export type { ValidatedMedia } from "../api/insert-media";
