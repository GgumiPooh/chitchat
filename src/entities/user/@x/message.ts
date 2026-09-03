// INFO: The FSD cross-import gate. `entities/message` advances the sender's own read cursor inside the same transaction it inserts a message in (REQUIREMENTS.md § 8.8.), so it needs exactly this one write from this slice.
export { advanceReadCursor } from "../api/mark-user-read";
