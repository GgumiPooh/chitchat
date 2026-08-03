import { listConversationMembers } from "@/entities/conversation";
import { listMessages } from "@/entities/message";
import { resolveDisplayName } from "@/entities/user";
import { cn } from "@/shared/lib";
import { AppHeader } from "@/shared/ui";
import { ChatRoom, type ChatParticipant } from "@/widgets/chat-room";

export type ChatPageProps = {
  className?: string;
  currentUserId: string;
};

// TODO: Live delivery, read receipts, and search are REQUIREMENTS.md § 8.4., § 8.6., and § 8.8.
export async function ChatPage({ className, currentUserId }: ChatPageProps) {
  // INFO: The newest page comes from the server render, so opening the tab costs no client round trip before the first paint.
  const [members, initialMessages] = await Promise.all([listConversationMembers(), listMessages()]);
  const participants: ChatParticipant[] = members.map((member) => ({
    name: resolveDisplayName(member),
    // TODO: Point the avatar at `GET /api/media/{id}` once the R2 pipeline lands — step 6 of REQUIREMENTS.md § 17.
    id: member.id,
  }));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col bg-chat-canvas", className)}>
      <AppHeader title="채팅" />
      <ChatRoom
        currentUserId={currentUserId}
        participants={participants}
        initialMessages={initialMessages}
      />
    </div>
  );
}
