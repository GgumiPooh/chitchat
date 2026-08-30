import type { ChatMessage } from "@/entities/message";
import type { PendingMessage } from "@/features/send-message";

// INFO: DESIGN.md § 6.1. One row is one virtualized item, dividers included.
export type ChatRow =
  | { key: string; kind: "date"; dayKey: string }
  | { key: string; kind: "system"; message: ChatMessage }
  /** DESIGN.md § 6.2., § 7.7. `systemAction === "assistant_reply"` — the finished AI answer, drawn as a left-aligned bubble rather than the § 6.5. pill every other system row takes. */
  | { key: string; kind: "assistant"; message: ChatMessage; isCollapsed: boolean }
  | {
      key: string;
      kind: "message";
      message: ChatMessage;
      /** REQUIREMENTS.md § 8.17. The row's own answer, which is the message's less whatever this reader has unfolded in place. */
      isCollapsed: boolean;
      isMine: boolean;
      isFirstOfGroup: boolean;
      isLastOfGroup: boolean;
      /** DESIGN.md § 6.2. The notch corner, which goes to the first *bubble* after each § 6.5. attachment or emoticon, since those draw none and break the run. */
      hasNotch: boolean;
    }
  | {
      key: string;
      kind: "pending";
      pending: PendingMessage;
      isFirstOfGroup: boolean;
      isLastOfGroup: boolean;
      hasNotch: boolean;
    };
