import type { ChatMessage } from "@/entities/message";
import type { PendingMessage } from "@/features/send-message";

// INFO: DESIGN.md § 6.1. One row is one virtualized item, dividers included.
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
