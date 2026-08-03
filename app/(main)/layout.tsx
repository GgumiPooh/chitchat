import { countUnreadMessages } from "@/entities/message";
import { requireUserOrRedirect } from "@/shared/auth";
import { Container, ScrollMemory } from "@/shared/ui";
import { InstallGuide } from "@/widgets/install-guide";
import { TabBar } from "@/widgets/tab-bar";
import type { PropsWithChildren } from "react";

// INFO: The proxy only saw that a cookie exists (REQUIREMENTS.md § 5.2.); this is the real check, and it covers every screen below.
export default async function MainLayout({ children }: PropsWithChildren) {
  const user = await requireUserOrRedirect();
  const unreadCount = await countUnreadMessages(user.id);

  return (
    <div className="min-h-dvh bg-backdrop">
      <Container className="flex min-h-dvh flex-col bg-canvas px-0 pb-[calc(var(--tab-bar-height)+var(--install-guide-height)+env(safe-area-inset-bottom))]">
        {children}
      </Container>
      <ScrollMemory />
      <InstallGuide />
      {/* TODO: The count is resolved once per full page load; REQUIREMENTS.md § 8.8. makes it live over SSE in step 5. */}
      <TabBar unreadCount={unreadCount} />
    </div>
  );
}
