// INFO: The FSD cross-import gate. The finished restructure makes an emoticon's assets `media` rows, so `entities/emoticon` registers them through the one mechanism that reads back what R2 actually stored — and needs exactly this from the slice.
// WARN: `validateMediaUpload` and `insertMedia` alone, deliberately. § 5. widens the mirror by two functions; opening the barrel would hand that slice the library's queries and its two removals as well, none of which an emoticon has any business reaching (§ 5.1.).
// INFO: `write-emoticon-item.ts` does the INSERT half on its own transaction — it resolves each upload with `validateMediaUpload` first and hands the result across this gate.
export { insertMedia, type ValidatedMedia } from "../api/insert-media";
export { validateMediaUpload } from "../api/validate-media-upload";
