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
import { mapPooled, randomId, type MediaId } from "@/shared/lib";
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
export function useArchiveUpload(
  shelf: LibraryShelf,
  onAdded: (media: ArchiveMedia) => void,
  onStranded: (ids: MediaId[]) => void,
) {
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

        const stranded = uploaded.length > 0 ? await post(uploaded) : [];
        const strandedItems = new Set(stranded);

        // WARN: § 18. #1. Rolled back off the screen, not merely reported. These rows reached R2 and `media` but no message, and a message is the whole of shelf membership now — so the tiles the pool prepended are drawing rows that `isInLibrary()` refuses, which a 삭제 aimed at them would answer with `삭제할 수 있는 사진이 없어요`.
        // INFO: Every stranded id goes over, not just this shelf's. `remove` is a filter, so an id this list never held costs nothing — and narrowing here is what would put the rollback and the count below out of step.
        if (stranded.length > 0) {
          onStranded(stranded.map(({ media }) => media.id));
        }

        // INFO: Only what actually landed, or the "went to another shelf" line names rows that went nowhere.
        reportOtherShelves(
          uploaded.filter((item) => !strandedItems.has(item)),
          shelf,
        );

        // INFO: AGENTS.md § 0.4. `3장을` and `3개를` are the same sentence, so the particle is picked rather than written.
        // INFO: The finished restructure. The counter follows the **noun**, not the shelf — 갤러리 counts its contents in 장 because they are 사진, which is the axis `toMediaCountUnit` takes.
        if (failedCount > 0) {
          toast.error(`${josa(toCounted(failedCount, shelf), "을/를")} 올리지 못했어요`);
        }

        // WARN: Counted separately from `failedCount` above, because it is a different failure — these did upload, and what they never got is the bubble that would have put them on a shelf.
        if (stranded.length > 0) {
          toast.error(
            `${josa(toCounted(stranded.length, shelf), "을/를")} 대화에 보내지 못해 보관함에도 담기지 않았어요`,
          );
        }
      } finally {
        setRunningCount((current) => Math.max(current - 1, 0));
      }
    },
    [shelf, onAdded, onStranded],
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
async function post(uploaded: Uploaded[]): Promise<Uploaded[]> {
  const bubbles = toBubbles(uploaded, ({ draft }) => toDraftKind(draft));

  for (const [index, bubble] of bubbles.entries()) {
    try {
      await postMessage({
        clientMsgId: randomId(),
        mediaIds: bubble.map(({ media }) => media.id),
      });
    } catch {
      // WARN: The bubbles are posted in order and stop at the first failure, so everything from here on is stranded — reporting only the failing bubble would leave the rest on screen as rows no query admits.
      // TODO: A rejection is taken at face value, so a response lost on a request the server committed is reported as stranded and its tiles taken back — they are really in 보관함 and return on the next load. Closing it wants the `client_msg_id` reconciliation the § 8.12. send queue has and this path does not.
      return bubbles.slice(index).flat();
    }
  }

  return [];
}

// INFO: The counter follows the **noun** rather than the shelf — 갤러리 counts its contents in 장 because they are 사진, which is the axis `toMediaCountUnit` takes.
function toCounted(count: number, shelf: LibraryShelf): string {
  return `${count}${toMediaCountUnit(shelf === "gallery" ? "photo" : shelf)}`;
}
