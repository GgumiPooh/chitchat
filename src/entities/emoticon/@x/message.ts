// INFO: The FSD cross-import gate. `entities/message` joins `emoticon_items` onto its own rows, so it needs exactly these two and nothing else from this slice.
export { toEmoticon } from "../model/to-emoticon";
export type { Emoticon } from "../model/types";
