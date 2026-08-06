// INFO: The FSD cross-import gate. REQUIREMENTS.md § 12.3.'s profile screen resolves the person it is showing against the same live participant set every name and avatar in the app resolves against (§ 8.7.) — a rename has to reach the profile that is already open, and this is the one place that set exists.
export { useChatStream, type ChatStreamValue } from "../model/chat-stream-provider";
