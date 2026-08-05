// INFO: The FSD cross-import gate. `entities/message` joins `message_media` onto its own rows, so it needs exactly these two and nothing else from this slice.
export { toChatMedia } from "../model/to-chat-media";
export type { ChatMedia } from "../model/types";
