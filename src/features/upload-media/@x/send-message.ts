// INFO: The FSD cross-import gate. `features/send-message` puts a staged attachment in R2 on the send, and frees the preview the optimistic bubble was drawn from once it lands.
export { uploadDraft, type UploadDraftOptions, type UploadProgress } from "../api/upload-draft";
export { revokePreview } from "../model/revoke-preview";
