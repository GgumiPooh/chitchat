"use client";

import type { CalendarSummary } from "@/entities/event";
import type { ChatMessage } from "@/entities/message";
import type { InlineEmoticonMap } from "@/shared/config";
import {
  cn,
  useDecryptedServerPayload,
  type Maybe,
  type MessageId,
  type UserId,
} from "@/shared/lib";
import { ChatScreen } from "./chat-screen";

export type DecryptedChatSeed = {
  messages: ChatMessage[];
  emoticons: InlineEmoticonMap;
  summary: CalendarSummary;
};

export type EncryptedChatScreenProps = {
  className?: string;
  currentUserId: UserId;
  encryptedPayload: string;
  jumpMessageId?: Maybe<MessageId>;
  jumpOnlyMe?: boolean;
  initialOnlyMeFilter: boolean;
};

export function EncryptedChatScreen({
  className,
  currentUserId,
  encryptedPayload,
  jumpMessageId,
  jumpOnlyMe,
  initialOnlyMeFilter,
}: EncryptedChatScreenProps) {
  const seed = useDecryptedServerPayload<DecryptedChatSeed>(encryptedPayload);

  if (!seed) {
    return <div className={cn("min-h-dvh bg-canvas", className)} />;
  }

  return (
    <ChatScreen
      className={className}
      currentUserId={currentUserId}
      initialMessages={seed.messages}
      initialEmoticons={seed.emoticons}
      initialSummary={seed.summary}
      jumpMessageId={jumpMessageId}
      jumpOnlyMe={jumpOnlyMe}
      initialOnlyMeFilter={initialOnlyMeFilter}
    />
  );
}
