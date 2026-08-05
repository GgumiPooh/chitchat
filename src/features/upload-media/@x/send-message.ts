// INFO: The FSD cross-import gate. `features/send-message` puts a staged attachment in R2 on the send, and this is the only thing it needs from this slice.
export { uploadDraft, type UploadDraftOptions, type UploadProgress } from "../api/upload-draft";
