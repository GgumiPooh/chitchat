// INFO: The FSD cross-import gate. `ask-ai`'s active-generation state is fed by the `llm` channel this stream already carries, and is retired by the same `useChatStreamListener` a chat message's own arrival reaches.
export { useChatStreamListener } from "../model/chat-stream-provider";
