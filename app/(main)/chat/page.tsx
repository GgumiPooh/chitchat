import { ChatPage } from "@/pages/chat";
import { requireUserOrRedirect } from "@/shared/auth";
import { CHAT_MESSAGE_PARAM } from "@/shared/config";
import type { Maybe } from "@/shared/lib";

type PageProps = {
  searchParams: Promise<Record<string, Maybe<string | string[]>>>;
};

export default async function Page({ searchParams }: PageProps) {
  // INFO: `requireUserOrRedirect` is request-cached, so this reuses the `(main)` layout's session lookup.
  const { chatBackgroundMediaId, id } = await requireUserOrRedirect();
  // INFO: REQUIREMENTS.md § 10. 보관함's 대화에서 보기 taps through carrying the message its tile was sent in, and § 8.6.1.'s jump takes it from there.
  const jumpMessageId = toMessageId((await searchParams)[CHAT_MESSAGE_PARAM]);

  return (
    <ChatPage
      currentUserId={id}
      backgroundMediaId={chatBackgroundMediaId}
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
function toMessageId(value: Maybe<string | string[]>): Maybe<number> {
  const id = typeof value === "string" ? Number(value) : NaN;

  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}
