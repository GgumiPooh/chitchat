// INFO: The FSD cross-import gate. REQUIREMENTS.md § 13.4. reuses the § 9. picker and editor rather than reimplementing them, and this is the only surface of this slice the emoticon flow may reach.
export { optimizeAudio } from "../model/optimize-audio";
export {
  EMOTICON_IMAGE_EDIT_OPTIONS,
  toEmoticonImageDrafts,
  type EmoticonImageDrafts,
} from "../model/read-emoticon-image";
export { releasePreview, retainPreview, revokePreview } from "../model/revoke-preview";
export { useMediaPicker } from "../model/use-media-picker";
export type { VoiceRecording } from "../model/use-voice-recorder";
export { MediaEditor } from "../ui/media-editor";
export { VoiceRecorderBar } from "../ui/voice-recorder-bar";
