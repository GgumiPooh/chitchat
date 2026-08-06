"use client";

import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";
import { useQuery } from "@tanstack/react-query";
import { Play } from "lucide-react";
import { toLinkPreviewQuery } from "../model/link-preview-query";

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
  // INFO: REQUIREMENTS.md § 8.3. Normally already answered — `useLinkPreviewPrefetch` asks the moment the message is in the window, so this reads the cache and the bubble is its final height at its first measurement.
  const { data: preview } = useQuery(toLinkPreviewQuery(url));

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
      // WARN: REQUIREMENTS.md § 8.10. Nothing is stopped here — the pointer has to reach the column so the card pulls to reply like the bubble beside it. The pull's own `onClickCapture` is what keeps the release from following the link, and it runs in the capture phase, so it has already called `preventDefault` by the time this anchor would navigate.
      // WARN: An `<a>` is natively draggable, and WebKit starts its own link drag on the hold that the § 8.10. pull begins with — which takes the gesture away before the first `pointermove` is measured.
      draggable={false}
    >
      {imageUrl && (
        // WARN: REQUIREMENTS.md § 8.3. The box is the row's height and it survives a refusal. Hiding the tile on `onError` instead took 124px out of a row that had already been measured — and `loading="lazy"` starts the request as the row nears the viewport, so it fired exactly while the reader was scrolling onto it.
        <div className="relative aspect-video">
          {/* WARN: `canRetry` off — this is the one image in the app that does not come from R2 (§ 9.), so § 13.3.'s cache-busted second attempt would only ask a host that already refused, on a URL we do not own. */}
          <PreloadImage
            className="size-full"
            imgClassName="size-full object-cover"
            src={imageUrl}
            alt=""
            loading="lazy"
            decoding="async"
            referrerPolicy="no-referrer"
            canRetry={false}
            // WARN: DESIGN.md § 3.2. As the § 6.5. cells — without it the pull starts WebKit's own image drag instead.
            draggable={false}
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
