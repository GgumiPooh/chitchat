// INFO: The FSD cross-import gate. REQUIREMENTS.md § 12. picks, crops and uploads an avatar through the § 9. pipeline rather than growing a second one, and this is the whole surface it reaches.
export { uploadDraft } from "../api/upload-draft";
export { toMediaDraft, validateFile } from "../model/read-draft";
export { releasePreview, retainPreview } from "../model/revoke-preview";
// INFO: REQUIREMENTS.md § 12.1. A profile background may be a video, and one longer than the cap is trimmed rather than refused.
export { isWithinDuration } from "../model/trim-video";
export { useMediaPicker } from "../model/use-media-picker";
export { DraftPreview } from "../ui/draft-preview";
export { MediaEditor } from "../ui/media-editor";
export { VideoTrimmer } from "../ui/video-trimmer";
