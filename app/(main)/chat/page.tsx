import { readChatBackgroundMediaId } from "@/entities/chat-background";
import { ChatPage } from "@/pages/chat";
import { requireUserOrRedirect } from "@/shared/auth";
import { CHAT_MESSAGE_PARAM, snowflakeSchema } from "@/shared/config";
import type { Maybe, MessageId } from "@/shared/lib";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  // INFO: `requireUserOrRedirect` and `readChatBackgroundMediaId` are both request-cached, so this reuses the `(main)` layout's lookups.
  const { id } = await requireUserOrRedirect();
  // INFO: REQUIREMENTS.md § 12.2. Read here only to emit the preload — the room itself takes the wallpaper from the shell's stream state, so a change by the other participant lands without a navigation.
  const backgroundMediaId = await readChatBackgroundMediaId();
  // INFO: REQUIREMENTS.md § 10. 보관함's 대화에서 보기 taps through carrying the message its tile was sent in, and § 8.6.1.'s jump takes it from there.
  const jumpMessageId = toMessageId((await searchParams)[CHAT_MESSAGE_PARAM]);

  return (
    <ChatPage
      currentUserId={id}
      backgroundMediaId={backgroundMediaId}
      jumpMessageId={jumpMessageId}
    />
  );
}

/**
 * WARN: Shape-checked rather than merely typed, as § 11.5.'s `?day=` is. The value
 * reaches `loadAround` as a query parameter, and `?message=abc` would spend a round
 * trip to be told the row does not exist — which surfaces as 원본 메시지를 찾지
 * 못했어요 on a URL anybody can type.
 */
function toMessageId(value: Maybe<string | string[]>): Maybe<MessageId> {
  const id = snowflakeSchema<MessageId>().safeParse(value);

  return id.success ? id.data : undefined;
}
