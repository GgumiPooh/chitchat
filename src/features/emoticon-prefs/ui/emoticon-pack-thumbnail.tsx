import type { EmoticonPackSummary } from "@/entities/emoticon";
import { toEmoticonAssetUrl } from "@/shared/config";
import { cn } from "@/shared/lib";
import { PreloadImage } from "@/shared/ui";
import { Smile } from "lucide-react";

export type EmoticonPackThumbnailProps = {
  className?: string;
  pack: EmoticonPackSummary;
};

/** REQUIREMENTS.md § 13.2. The pack's resolved tab-icon item, shared by every row that lists packs. */
export function EmoticonPackThumbnail({ className, pack }: EmoticonPackThumbnailProps) {
  return (
    <div
      className={cn(
        "flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-soft ring-1 ring-hairline ring-inset",
        className,
      )}
    >
      {pack.thumbnailItemId ? (
        <PreloadImage
          className="size-full"
          imgClassName="size-full object-contain"
          alt=""
          src={toEmoticonAssetUrl(
            pack.thumbnailItemId,
            "still-image",
            pack.thumbnailVersion ?? undefined,
          )}
        />
      ) : (
        <Smile className="size-5 text-meta-soft" strokeWidth={1.75} />
      )}
    </div>
  );
}
