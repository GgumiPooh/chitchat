// INFO: The FSD cross-import gate. REQUIREMENTS.md § 13.4. reuses the § 9. picker and editor rather than reimplementing them, and this is the only surface of this slice the emoticon flow may reach.
export { AnimateVideoError, type AnimationFailure } from "../model/animate-encode";
export { animateImage } from "../model/animate-image";
export { animateVideo } from "../model/animate-video";
export { extractVideoAudio } from "../model/extract-video-audio";
export { releaseFfmpeg } from "../model/ffmpeg-runtime";
export { optimizeAudio } from "../model/optimize-audio";
export { toMediaDraft, toStoredMime } from "../model/read-draft";
export {
  EMOTICON_IMAGE_EDIT_OPTIONS,
  encodeEmoticonStill,
  toEmoticonImageDrafts,
  toEncodedEmoticonDrafts,
  type EmoticonImageDrafts,
} from "../model/read-emoticon-image";
export { releasePreview, retainPreview, revokePreview } from "../model/revoke-preview";
export type { TrimRange } from "../model/trim-video";
export { useMediaPicker } from "../model/use-media-picker";
// INFO: Re-exported so the emoticon flow states a crop and a rotation in `animateImage`'s own terms rather than importing mediabunny beside it.
export type { CropRectangle, Rotation } from "mediabunny";
export type { VoiceRecording } from "../model/use-voice-recorder";
export { CutoutEditor } from "../ui/cutout-editor";
export { MediaEditor } from "../ui/media-editor";
export { VideoCropper } from "../ui/video-cropper";
export { VideoTrimmer } from "../ui/video-trimmer";
export { VoiceRecorderBar } from "../ui/voice-recorder-bar";
