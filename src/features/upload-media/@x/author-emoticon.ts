// INFO: The FSD cross-import gate. REQUIREMENTS.md § 13.4. reuses the § 9. picker and editor rather than reimplementing them, and this is the only surface of this slice the emoticon flow may reach.
export { EMOTICON_IMAGE_EDIT_OPTIONS, toEmoticonImageDraft } from "../model/read-emoticon-image";
export { releasePreview, retainPreview, revokePreview } from "../model/revoke-preview";
export { MediaEditor } from "../ui/media-editor";
export { MediaPickerSheet } from "../ui/media-picker-sheet";
