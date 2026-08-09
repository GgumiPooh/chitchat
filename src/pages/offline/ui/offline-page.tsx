import { HOME_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { Button, Container } from "@/shared/ui";
import { WifiOff } from "lucide-react";

export type OfflinePageProps = {
  className?: string;
};

// WARN: REQUIREMENTS.md § 16. Nothing here may read the session or render user data — the service worker serves this page from the cache, which is shared by every account that has used this browser.
export function OfflinePage({ className }: OfflinePageProps) {
  return (
    // INFO: DESIGN.md § 3.3. The document is the scroller here too, so the column is in flow at `min-h-dvh` rather than a percentage of a body that no longer has a height.
    <main className={cn("flex min-h-dvh flex-col bg-canvas", className)}>
      <Container className="flex flex-1 flex-col justify-between py-2xl" size="sm">
        <div className="flex flex-1 flex-col items-center justify-center gap-sm text-center">
          <WifiOff className="size-8 text-meta-soft" strokeWidth={1.5} />
          <h1 className="text-display-md text-ink">인터넷에 연결되어 있지 않아요</h1>
          <p className="text-body-md text-meta">연결이 돌아오면 다시 시도해 주세요</p>
        </div>

        {/* WARN: A bare `<a>` rather than an `onClick` reload or a client `Link` — this screen is shown precisely when a chunk fetch can fail, so its one control must survive with no JavaScript at all. A real navigation re-enters the worker, which retries the network. */}
        <Button asChild>
          <a href={HOME_ROUTE}>다시 시도</a>
        </Button>
      </Container>
    </main>
  );
}
