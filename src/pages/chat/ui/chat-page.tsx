import { listMessages } from "@/entities/message";
import { cn } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChatRoom } from "@/widgets/chat-room";
import { Search } from "lucide-react";

export type ChatPageProps = {
  className?: string;
  currentUserId: string;
};

// TODO: Read receipts and search are REQUIREMENTS.md § 8.8. and § 8.6.
export async function ChatPage({ className, currentUserId }: ChatPageProps) {
  // INFO: The newest page comes from the server render, so opening the tab costs no client round trip before the first paint. Participants are the shell's (§ 8.4.), since every tab needs them for the in-app banner.
  const initialMessages = await listMessages();

  return (
    // WARN: DESIGN.md § 3.5. Cancels the scroller's `--bottom-inset` padding rather than honouring it — chat is the one screen whose messages run all the way under the floating bars, and the composer reserves that room inside the list instead (§ 6.6.).
    <div
      className={cn(
        "mb-[calc(var(--bottom-inset,0px)*-1)] flex min-h-0 flex-1 flex-col bg-chat-canvas",
        className,
      )}
    >
      {/* INFO: DESIGN.md § 7.12. No title — the tab bar already says which screen this is, and the messages read better with the full column. */}
      {/* TODO: Wire the search sheet in step 5 — REQUIREMENTS.md § 8.6. */}
      <AppHeader
        trailing={<IconButton Icon={Search} variant="floating" aria-label="메시지 검색" />}
      />
      <ChatRoom currentUserId={currentUserId} initialMessages={initialMessages} />
    </div>
  );
}
