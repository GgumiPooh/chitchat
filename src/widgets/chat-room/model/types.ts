import type { ChatMessage } from "@/entities/message";
import type { PendingMessage } from "@/features/send-message";

// INFO: DESIGN.md § 6.1. One row is one virtualized item, dividers included.
export type ChatRow =
  | { key: string; kind: "date"; dayKey: string }
  | { key: string; kind: "system"; message: ChatMessage }
  /** DESIGN.md § 6.2., § 7.7. `systemAction === "assistant_reply"` — the finished AI answer, drawn as a left-aligned bubble rather than the § 6.5. pill every other system row takes. */
  | { key: string; kind: "assistant"; message: ChatMessage }
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
