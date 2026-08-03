import type { ChatMessage } from "@/entities/message";
import type { PendingMessage } from "@/features/send-message";

/** REQUIREMENTS.md § 8.7. The name is resolved from `users.nickname` at render time, never read off a message row. */
export type ChatParticipant = {
  name: string;
  avatarSrc?: string;
  id: string;
};

// INFO: DESIGN.md § 6.1. One row is one virtualized item, dividers included — the sticky day indicator is a separate overlay.
export type ChatRow =
  | { key: string; kind: "date"; dayKey: string }
  | { key: string; kind: "system"; message: ChatMessage }
  | {
      key: string;
      kind: "message";
      message: ChatMessage;
      isMine: boolean;
      isFirstOfGroup: boolean;
      isLastOfGroup: boolean;
    }
  | {
      key: string;
      kind: "pending";
      pending: PendingMessage;
      isFirstOfGroup: boolean;
      isLastOfGroup: boolean;
    };
