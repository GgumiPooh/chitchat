"use client";

import { cn, withoutFragment } from "@/shared/lib";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { useState } from "react";
import { fetchLinkPreview } from "../api/fetch-link-preview";

export type LinkPreviewCardProps = {
  className?: string;
  url: string;
};

/**
 * DESIGN.md § 6.9. The card a text bubble grows above its text when the message
 * carries a link.
 *
 * INFO: Nothing is rendered while the scrape is in flight — most links describe
 * themselves with nothing (REQUIREMENTS.md § 8.9.), so a reserved box would be a
 * placeholder that usually collapses again, which is a worse jolt in a virtualized
 * list (§ 8.3.) than one that only appears when there is something to show.
 */
export function LinkPreviewCard({ className, url }: LinkPreviewCardProps) {
  const [hasImageFailed, setHasImageFailed] = useState(false);
  // INFO: The card still links to the URL as it was typed; only the lookup drops the fragment, so two bubbles pointing at different anchors of one page share a cache entry instead of a round trip each.
  const target = withoutFragment(url);
  const { data: preview } = useQuery({
    queryKey: ["link-preview", target],
    queryFn: () => fetchLinkPreview(target),
    // WARN: The answer is already cached server-side for days (§ 8.9.), so a refetch on mount would be a request per scroll back onto the bubble that can only return what it returned before.
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  });

  if (!preview) {
    return null;
  }

  const { title, description, imageUrl, siteName, kind } = preview;

  return (
    <a
      className={cn(
        "block overflow-hidden rounded-md border border-hairline bg-canvas transition-colors hover:bg-surface-soft active:bg-surface-pressed",
        className,
      )}
      href={url}
      target="_blank"
      rel="noreferrer"
      // WARN: `pointerdown` is what arms the bubble's long press, so it has to stop here or holding the card opens the action sheet *and* follows the link on release.
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {imageUrl && !hasImageFailed && (
        <div className="relative aspect-video bg-surface-strong">
          {/* WARN: Loaded straight from the publisher's origin — it is the one image in the app that does not come from R2 (§ 9.), so a host that refuses to serve it hides the tile rather than leaving a broken frame in the bubble. */}
          <img
            className="size-full object-cover"
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            onError={() => setHasImageFailed(true)}
          />
          {kind === "video" && (
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex size-10 items-center justify-center rounded-full bg-scrim/60">
                <Play className="size-5 translate-x-[1px] fill-on-primary text-on-primary" />
              </span>
            </span>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2xs px-sm py-xs">
        {title && <span className="line-clamp-2 text-title-sm text-ink">{title}</span>}
        {description && <span className="line-clamp-2 text-body-sm text-body">{description}</span>}
        {siteName && <span className="line-clamp-1 text-caption text-meta">{siteName}</span>}
      </div>
    </a>
  );
}
