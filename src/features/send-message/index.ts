// INFO: REQUIREMENTS.md § 10. The library posts what it uploaded without a composer to stage it in, so it reaches the endpoint directly rather than through `useSendMessage`'s optimistic queue.
export { postMessage, type PostMessageParams } from "./api/post-message";
// INFO: REQUIREMENTS.md § 9.1. The bubble split is the server's rule, so 보관함's own post path takes it from here rather than restating it.
export { toBubbles, toDraftKind, type DraftKind } from "./model/to-bubbles";
// INFO: REQUIREMENTS.md § 8.14. The menu digits are the room's, because whether the panel is on screen at all is its state — so the room needs the bar's own order to read them by.
export { EMOTICON_MENUS, type EmoticonMenu } from "./model/emoticon-tabs";
// INFO: REQUIREMENTS.md § 13.6. Warmed from the room rather than from the panel, which does not exist until the tap this exists to make cheap.
export { useEmoticonPreload } from "./model/use-emoticon-preload";
// INFO: REQUIREMENTS.md § 13.6. 최근 "사용" is recorded at the send, which the room owns — the picker only reads the list back.
export { useRecentEmoticons } from "./model/use-recent-emoticons";
export {
  useSendMessage,
  type PendingMessage,
  type UseSendMessageParams,
} from "./model/use-send-message";
export {
  DOUBLE_TAP_WINDOW,
  EmoticonPicker,
  type EmoticonFocusRequest,
  type EmoticonPickerProps,
} from "./ui/emoticon-picker";
export { EmoticonPreview, type EmoticonPreviewProps } from "./ui/emoticon-preview";
export {
  MessageComposer,
  type ComposedMessage,
  type ComposerEmoticon,
  type MessageComposerProps,
} from "./ui/message-composer";
