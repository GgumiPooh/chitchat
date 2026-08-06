"use client";

import type { GalleryMedia, MediaDraft } from "@/entities/media";
import { postMessage } from "@/features/send-message";
import { uploadDraft } from "@/features/upload-media";
import {
  MAX_MEDIA_PER_MESSAGE,
  MAX_UPLOAD_INFLIGHT_BYTES,
  UPLOAD_CONCURRENCY,
} from "@/shared/config";
import { mapPooled, randomId } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useState } from "react";

export type GalleryUploadParams = {
  /** REQUIREMENTS.md § 10. Post the photos to the conversation as well, rather than only filing them in the gallery. */
  shouldPost: boolean;
};

/**
 * REQUIREMENTS.md § 10. Adding photos from the Gallery tab.
 *
 * INFO: Not routed through `useSendMessage`. That queue exists to render an
 * optimistic bubble in a room this screen is not showing, and its failure state is
 * a 재전송 affordance on a bubble that does not exist here.
 *
 * WARN: Takes **drafts, not files**. The screen stages a pick first so each item
 * can be edited before it goes up (§ 10.), which means validation and decoding have
 * already happened by the time this runs — reading them again here would decode
 * every file a second time and throw away the edit.
 */
export function useGalleryUpload(onAdded: (media: GalleryMedia) => void) {
  // WARN: Every write to these two is relative, never absolute. A second pick while the first batch is running is an ordinary thing to do, and an absolute `setRemainingCount(n)` would wipe the batch already in flight — then the first batch finishing would zero the counter under the second and flip the screen to its empty state mid-upload.
  const [remainingCount, setRemainingCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);

  const upload = useCallback(
    async (drafts: MediaDraft[], { shouldPost }: GalleryUploadParams) => {
      setRunningCount((current) => current + 1);
      setRemainingCount((current) => current + drafts.length);

      try {
        // WARN: Pooled, not one at a time. § 13.4. settled this for the bulk emoticon add and the reason is the same here — the byte budget is what keeps a pick of 500MB videos from going out four abreast, which a bare concurrency limit would not.
        const results = await mapPooled(
          drafts,
          async (draft) => {
            try {
              // WARN: `addToGallery` even when the photo is also being posted. The user filed it in the gallery, so it must be there whether or not the POST that follows succeeds — and it must survive that message later being deleted.
              const media = await uploadDraft(draft, { addToGallery: true });

              onAdded(media);

              return media.id;
            } catch {
              return null;
            } finally {
              URL.revokeObjectURL(draft.previewUrl);
              setRemainingCount((current) => Math.max(current - 1, 0));
            }
          },
          {
            limit: UPLOAD_CONCURRENCY,
            byteBudget: MAX_UPLOAD_INFLIGHT_BYTES,
            weigh: (draft) => draft.file.size,
          },
        );

        // WARN: `mapPooled` answers in pick order, and `post` below depends on it — § 18. #10. splits a long send into consecutive bubbles and `messages.id` is assigned by the POST, so completion order would reverse the photos on every other client.
        // WARN: `Boolean`, not `!== null`. A rejected task leaves its slot a hole rather than a `null`, and `undefined` would pass that narrower test and be posted as a `mediaId`.
        const uploadedIds = results.filter((id): id is string => Boolean(id));
        const failedCount = results.length - uploadedIds.length;

        if (shouldPost && uploadedIds.length > 0) {
          await post(uploadedIds);
        }

        if (failedCount > 0) {
          toast.error(`${failedCount}장을 올리지 못했어요`);
        }
      } finally {
        setRunningCount((current) => Math.max(current - 1, 0));
      }
    },
    [onAdded],
  );

  // WARN: `isBusy` outlives `remainingCount`. It stays true through `post`, which is when the rows exist with no `message_media` child yet — `removeGalleryMedia` reads exactly that as "nothing renders it" and would delete them out from under the send.
  return { remainingCount, isBusy: runningCount > 0, upload };
}

/**
 * WARN: REQUIREMENTS.md § 18. #10. A send longer than `MAX_MEDIA_PER_MESSAGE` splits
 * into consecutive bubbles rather than being capped, and the chunks are posted **in
 * order** — `messages.id` is assigned by the POST, so racing them with a `Promise.all`
 * would reverse the photos on every other client.
 */
async function post(mediaIds: string[]) {
  try {
    for (let index = 0; index < mediaIds.length; index += MAX_MEDIA_PER_MESSAGE) {
      await postMessage({
        clientMsgId: randomId(),
        mediaIds: mediaIds.slice(index, index + MAX_MEDIA_PER_MESSAGE),
      });
    }
  } catch {
    // INFO: The objects are registered with the gallery marker before this runs, so the photos are already in the grid — only the bubble is missing, and that is what the copy says.
    toast.error("사진은 저장했지만 대화에는 보내지 못했어요");
  }
}
