"use client";

import type { ArchiveMedia, MediaDraft } from "@/entities/media";
import { postMessage, toBubbles, toDraftKind } from "@/features/send-message";
import { revokePreview, uploadDraft } from "@/features/upload-media";
import {
  LIBRARY_SHELF_LABELS,
  MAX_UPLOAD_INFLIGHT_BYTES,
  UPLOAD_CONCURRENCY,
  toMediaCountUnit,
  type LibraryShelf,
} from "@/shared/config";
import { mapPooled, randomId } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { useCallback, useState } from "react";

type Uploaded = {
  draft: MediaDraft;
  media: ArchiveMedia;
};

/**
 * REQUIREMENTS.md § 10. Adding to 보관함, from any of its three shelves.
 *
 * WARN: § 18. #1. The post is what puts a row on the shelf, so it is no longer optional.
 * A row earns its place in 보관함 by hanging off a live message and by nothing else now
 * that `archive_added_at` is gone — an upload whose POST fails is reachable from no
 * screen at all, which is what the failure copy has to say rather than promising a shelf.
 *
 * INFO: Not routed through `useSendMessage`. That queue exists to render an
 * optimistic bubble in a room this screen is not showing, and its failure state is
 * a 재전송 affordance on a bubble that does not exist here.
 *
 * WARN: Takes **drafts, not files**. The screen stages a pick first so each item
 * can be edited before it goes up (§ 10.), which means validation and decoding have
 * already happened by the time this runs — reading them again here would decode
 * every file a second time and throw away the edit.
 *
 * WARN: `shelf` is the one this is running on, and it is not decoration: a drop is
 * taken whatever it holds (§ 9.2.), so a photo dropped on 파일 lands on 갤러리 and
 * never appears on the screen it was dropped on. That is what the closing toast is
 * for, and it is why `onAdded` is called only for the rows this shelf can list.
 */
export function useArchiveUpload(shelf: LibraryShelf, onAdded: (media: ArchiveMedia) => void) {
  // WARN: Every write to these two is relative, never absolute. A second pick while the first batch is running is an ordinary thing to do, and an absolute `setRemainingCount(n)` would wipe the batch already in flight — then the first batch finishing would zero the counter under the second and flip the screen to its empty state mid-upload.
  const [remainingCount, setRemainingCount] = useState(0);
  const [runningCount, setRunningCount] = useState(0);

  const upload = useCallback(
    async (drafts: MediaDraft[]) => {
      setRunningCount((current) => current + 1);
      setRemainingCount((current) => current + drafts.length);

      try {
        // WARN: Pooled, not one at a time. § 13.4. settled this for the bulk emoticon add and the reason is the same here — the byte budget is what keeps a pick of 500MB videos from going out four abreast, which a bare concurrency limit would not.
        const results = await mapPooled(
          drafts,
          async (draft) => {
            try {
              const media = await uploadDraft(draft);

              // INFO: Only the rows this shelf lists are prepended. The others are real and are in 보관함, but `isOfShelf` puts them on a different segment, and pushing one into this list would draw a file card through the 갤러리 grid.
              if (toShelf(draft) === shelf) {
                onAdded(media);
              }

              return { draft, media };
            } catch {
              return null;
            } finally {
              revokePreview(draft);
              setRemainingCount((current) => Math.max(current - 1, 0));
            }
          },
          {
            limit: UPLOAD_CONCURRENCY,
            byteBudget: MAX_UPLOAD_INFLIGHT_BYTES,
            weigh: (draft) => draft.file.size,
          },
        );

        // WARN: `mapPooled` answers in pick order, and `post` below depends on it — § 18. #10. splits a long send into consecutive bubbles and `messages.id` is assigned by the POST, so completion order would reverse the items on every other client.
        // WARN: `Boolean`, not `!== null`. A rejected task leaves its slot a hole rather than a `null`, and `undefined` would pass that narrower test.
        const uploaded = results.filter((result): result is Uploaded => Boolean(result));
        const failedCount = results.length - uploaded.length;

        if (uploaded.length > 0) {
          await post(uploaded);
        }

        reportOtherShelves(uploaded, shelf);

        if (failedCount > 0) {
          // INFO: AGENTS.md § 0.4. `3장을` and `3개를` are the same sentence, so the particle is picked rather than written.
          // INFO: The finished restructure. The counter follows the **noun**, not the shelf — 갤러리 counts its contents in 장 because they are 사진, which is the axis `toMediaCountUnit` takes.
          toast.error(
            `${josa(`${failedCount}${toMediaCountUnit(shelf === "gallery" ? "photo" : shelf)}`, "을/를")} 올리지 못했어요`,
          );
        }
      } finally {
        setRunningCount((current) => Math.max(current - 1, 0));
      }
    },
    [shelf, onAdded],
  );

  // WARN: `isBusy` outlives `remainingCount`. It stays true through `post`, which is the window in which a prepended tile is on screen with no `message_media` child behind it — `isInLibrary()` does not admit it yet, so a 삭제 aimed at it would silently take nothing.
  return { remainingCount, isBusy: runningCount > 0, upload };
}

// INFO: The shelf a draft will be listed on once it is a row, which is `toDraftKind`'s answer under the § 2.7. name for the two kinds 갤러리 holds.
function toShelf(draft: MediaDraft): LibraryShelf {
  const kind = toDraftKind(draft);

  return kind === "media" ? "gallery" : kind;
}

/**
 * REQUIREMENTS.md § 10. Says where an upload went when it did not go here.
 *
 * INFO: A drop is taken whatever it holds rather than refused (§ 9.2.), so this is
 * the other half of that decision — refusing would leave the user asking why, and
 * staying silent would leave them believing the upload failed. One line per shelf
 * that actually received something, never one per item.
 */
function reportOtherShelves(uploaded: Uploaded[], shelf: LibraryShelf): void {
  const elsewhere = new Set(
    uploaded.map(({ draft }) => toShelf(draft)).filter((landed) => landed !== shelf),
  );

  for (const landed of elsewhere) {
    // INFO: `에` has one form whatever precedes it, so AGENTS.md § 0.4. does not apply and the shelf name goes in as it is.
    toast.success(`${LIBRARY_SHELF_LABELS[landed]}에 추가했어요`);
  }
}

/**
 * WARN: REQUIREMENTS.md § 9.1. Split by `toBubbles`, which is the send path's own
 * splitter rather than a second copy of the rule. `ownsAllMedia` refuses a mixed
 * `mediaIds` set at the server, and a drop on the 파일 shelf is exactly how a mixed
 * batch gets here — chunking by count alone posted photos and files in one bubble
 * and took a 400 for it.
 *
 * WARN: § 18. #10. The chunks are posted **in order** — `messages.id` is assigned by
 * the POST, so racing them with a `Promise.all` would reverse them on every other
 * client.
 */
async function post(uploaded: Uploaded[]) {
  try {
    for (const bubble of toBubbles(uploaded, ({ draft }) => toDraftKind(draft))) {
      await postMessage({
        clientMsgId: randomId(),
        mediaIds: bubble.map(({ media }) => media.id),
      });
    }
  } catch {
    // WARN: § 18. #1. The bubble is the only thing that puts a row on the shelf, so a failed post leaves nothing behind to promise — the copy no longer names a 보관함 the upload never reached.
    toast.error("대화에 보내지 못해서 보관함에도 담기지 않았어요");
  }
}
