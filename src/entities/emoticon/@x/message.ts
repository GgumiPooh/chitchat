// INFO: The FSD cross-import gate. `entities/message` joins `emoticon_items` onto its own rows, so it needs exactly these four and nothing else from this slice.
export { listInlineEmoticons } from "../api/list-inline-emoticons";
export { selectEmoticons } from "../api/select-emoticons";
export { toEmoticon } from "../model/to-emoticon";
export type { Emoticon } from "../model/types";
