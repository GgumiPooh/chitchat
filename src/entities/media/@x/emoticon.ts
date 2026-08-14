// INFO: The FSD cross-import gate. RESTRUCTURE.md § 5.2. makes an emoticon's assets `media` rows, so `entities/emoticon` registers them through the one mechanism that reads back what R2 actually stored — and needs exactly this from the slice.
// WARN: `registerMedia` alone, deliberately. § 5. widens the mirror by one function; opening the barrel would hand that slice the library's queries and its two removals as well, none of which an emoticon has any business reaching (§ 5.1.).
export { registerMedia } from "../api/register-media";
