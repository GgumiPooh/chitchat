// INFO: The FSD cross-import gate. REQUIREMENTS.md § 8.15.'s prompt is shared, so the header sheet has to read and write the live value rather than the one its Server Component was rendered with — the other participant can change it while this screen is open.
export { useChatStream } from "../model/chat-stream-provider";
