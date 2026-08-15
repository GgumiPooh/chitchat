// INFO: The FSD cross-import gate. REQUIREMENTS.md § 12.2.'s wallpaper is shared, so the 채팅방 배경 row has to read the live value rather than the one its Server Component was rendered with — the other participant can change it while this screen is open, and a stale row offers 기본 배경으로 for a photo that is already gone.
export { useChatStream } from "../model/chat-stream-provider";
