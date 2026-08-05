"use client";

import type { GalleryMedia, MediaDraft } from "@/entities/media";
import { postMessage } from "@/features/send-message";
import { toMediaDraft, uploadDraft, validateFile } from "@/features/upload-media";
import { MAX_MEDIA_PER_MESSAGE } from "@/shared/config";
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
 */
export function useGalleryUpload(onAdded: (media: GalleryMedia) => void) {
  // WARN: Every write to these two is relative, never absolute. A second pick while the first batch is running is an ordinary thing to do, and an absolute `setRemainingCount(n)` would wipe the batch already in flight — then the first batch finishing would zero the counter under the second and flip the screen to its empty state mid-upload.
  const [remainingCount, setRemainingCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);

  const upload = useCallback(
    async (files: File[], { shouldPost }: GalleryUploadParams) => {
      setRunningCount((current) => current + 1);
      // INFO: Claimed before the files are decoded, not after. Decoding forty photos takes seconds (§ 9. reads their real dimensions), and until this lands the screen says nothing is happening.
      setRemainingCount((current) => current + files.length);

      try {
        const drafts = await readDrafts(files);

        // INFO: What validation rejected never reaches the loop below, so its share of the claim is released here.
        setRemainingCount((current) => Math.max(current - (files.length - drafts.length), 0));

        const uploadedIds: string[] = [];
        let failedCount = 0;

        // WARN: One at a time. § 13.4. settled this for the bulk emoticon add and the reason is the same here — twenty simultaneous presigned PUTs on a phone network are twenty ways to time out.
        for (const draft of drafts) {
          try {
            // WARN: `addToGallery` even when the photo is also being posted. The user filed it in the gallery, so it must be there whether or not the POST that follows succeeds — and it must survive that message later being deleted.
            const media = await uploadDraft(draft, { addToGallery: true });

            uploadedIds.push(media.id);
            onAdded(media);
          } catch {
            failedCount += 1;
          } finally {
            URL.revokeObjectURL(draft.previewUrl);
            setRemainingCount((current) => Math.max(current - 1, 0));
          }
        }

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
 * INFO: The same validation and decoding the composer's tray does — § 9.'s
 * dimensions and thumbnail are read here too, because the `media` row needs them
 * whichever screen the file came from.
 */
async function readDrafts(files: File[]): Promise<MediaDraft[]> {
  const drafts: MediaDraft[] = [];
  const rejections = new Set<string>();

  for (const file of files) {
    const rejection = validateFile(file);

    if (rejection) {
      rejections.add(rejection);
      continue;
    }

    try {
      drafts.push(await toMediaDraft(file));
    } catch {
      rejections.add("파일을 읽지 못했어요");
    }
  }

  // INFO: One toast per distinct reason, not per file — picking forty photos with three oversized ones must not stack forty banners.
  rejections.forEach((rejection) => toast.error(rejection));

  return drafts;
}

/**
 * WARN: REQUIREMENTS.md § 18. #10. A send longer than `MAX_MEDIA_PER_MESSAGE`
 * splits into consecutive bubbles rather than being capped, and the chunks are
 * posted in order — `messages.id` is assigned by the POST, so racing them would
 * reverse the order on every other client.
 */
async function post(mediaIds: string[]) {
  try {
    for (let index = 0; index < mediaIds.length; index += MAX_MEDIA_PER_MESSAGE) {
      await postMessage({
        clientMsgId: crypto.randomUUID(),
        mediaIds: mediaIds.slice(index, index + MAX_MEDIA_PER_MESSAGE),
      });
    }
  } catch {
    // INFO: The objects are registered with the gallery marker before this runs, so the photos are already in the grid — only the bubble is missing, and that is what the copy says.
    toast.error("사진은 저장했지만 대화에는 보내지 못했어요");
  }
}
