import { cn } from "@/shared/lib";
import { AppHeader, EmptyState } from "@/shared/ui";
import { MessageCircle } from "lucide-react";

export type ChatPageProps = {
  className?: string;
};

// TODO: Replace the body with the virtualized message list — step 5 of REQUIREMENTS.md § 17.
export function ChatPage({ className }: ChatPageProps) {
  return (
    <div className={cn("flex flex-1 flex-col bg-chat-canvas", className)}>
      <AppHeader title="채팅" />
      <div className="flex flex-1 items-center justify-center p-md">
        <EmptyState Icon={MessageCircle} description="아직 주고받은 메시지가 없어요" />
      </div>
    </div>
  );
}
