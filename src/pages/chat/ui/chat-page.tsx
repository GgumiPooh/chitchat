import { listMessages } from "@/entities/message";
import { listUsers, resolveDisplayName } from "@/entities/user";
import { cn } from "@/shared/lib";
import { AppHeader, IconButton } from "@/shared/ui";
import { ChatRoom, type ChatParticipant } from "@/widgets/chat-room";
import { Search } from "lucide-react";

export type ChatPageProps = {
  className?: string;
  currentUserId: string;
};

// TODO: Live delivery, read receipts, and search are REQUIREMENTS.md § 8.4., § 8.6., and § 8.8.
export async function ChatPage({ className, currentUserId }: ChatPageProps) {
  // INFO: The newest page comes from the server render, so opening the tab costs no client round trip before the first paint.
  const [members, initialMessages] = await Promise.all([listUsers(), listMessages()]);
  const participants: ChatParticipant[] = members.map((member) => ({
    name: resolveDisplayName(member),
    // TODO: Point the avatar at `GET /api/media/{id}` once the R2 pipeline lands — step 6 of REQUIREMENTS.md § 17.
    id: member.id,
  }));

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
      <ChatRoom
        currentUserId={currentUserId}
        participants={participants}
        initialMessages={initialMessages}
      />
    </div>
  );
}
