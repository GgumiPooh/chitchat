import { resolveDisplayName } from "@/entities/user";
import { LogoutButton } from "@/features/session";
import type { User } from "@/shared/db";
import { cn } from "@/shared/lib";
import { Avatar, Container } from "@/shared/ui";

export type ChatPageProps = {
  className?: string;
  user: User;
};

// TODO: Replace with the real message list in step 5 of REQUIREMENTS.md § 17.; this only proves the session resolves.
export function ChatPage({ className, user }: ChatPageProps) {
  const displayName = resolveDisplayName(user);

  return (
    <main className={cn("min-h-dvh bg-chat-canvas", className)}>
      <Container className="flex min-h-dvh flex-col items-center justify-center gap-md">
        <Avatar name={displayName} size="profile" />
        <p className="text-title-md text-ink">{displayName}</p>
        <LogoutButton className="w-auto" />
      </Container>
    </main>
  );
}
