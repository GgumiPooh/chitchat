// INFO: The FSD cross-import gate. `features/send-message` puts a staged attachment in R2 on the send, and frees the preview the optimistic bubble was drawn from once it lands.
export { uploadDraft, type UploadDraftOptions, type UploadProgress } from "../api/upload-draft";
export { revokePreview } from "../model/revoke-preview";
// INFO: REQUIREMENTS.md § 10. 채팅으로 보내기's edit-promotion — an id-backed draft has to be downloaded and read into a real one before the tray's own editors can open on it.
export { toMediaDraft } from "../model/read-draft";
export type { AttachmentEditing } from "../model/use-attachment-editing";
