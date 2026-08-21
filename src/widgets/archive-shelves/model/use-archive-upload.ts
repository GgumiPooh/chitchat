"use client";

import type { ArchiveMedia, MediaDraft, MediaUpload } from "@/entities/media";
import { postMessage, toBubbles, toDraftKind } from "@/features/send-message";
import { revokePreview, uploadDraft } from "@/features/upload-media";
import {
  LIBRARY_SHELF_LABELS,
  MAX_UPLOAD_INFLIGHT_BYTES,
  UPLOAD_CONCURRENCY,
  toMediaCountUnit,
  type LibraryShelf,
} from "@/shared/config";
import { mapPooled, randomId, type Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { josa } from "es-hangul";
import { useCallback, useState } from "react";

type Uploaded = {
  draft: MediaDraft;
  upload: MediaUpload;
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
 *
 * WARN: The finished restructure. `onAdded` fires once a bubble's `POST /api/messages`
 * has actually landed, not as each draft's own R2 PUT finishes — registration and
 * attachment happen inside that one request now, so there is no row to prepend before
 * it returns, and so a failed post here leaves nothing registered to roll back.
 */
export function useArchiveUpload(shelf: LibraryShelf, onAdded: (media: ArchiveMedia) => void) {
  // WARN: Every write to these two is relative, never absolute. A second pick while the first batch is running is an ordinary thing to do, and an absolute `setRemainingCount(n)` would wipe the batch already in flight — then the first batch finishing would zero the counter under the second and flip the screen to its empty state mid-upload.
  const [remainingCount, setRemainingCount] = useState(0);
  // INFO: § 9. The re-encode that precedes each PUT — a count alone does not move for the minutes a video spends being transcoded.
  const [encodeProgress, setEncodeProgress] = useState<Nullable<number>>(null);
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
              const upload = await uploadDraft(draft, {
                onEncodeProgress: setEncodeProgress,
                // INFO: The PUT moving bytes ends this draft's encode phase, exactly as it does on the § 8. send path.
                onProgress: () => setEncodeProgress(null),
              });

              return { draft, upload };
            } catch {
              return null;
            } finally {
              revokePreview(draft);
              setEncodeProgress(null);
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

        const { landed, failedToPostCount } = await post(uploaded, onAdded, shelf);

        // INFO: Only what actually landed, or the "went to another shelf" line names rows that went nowhere.
        reportOtherShelves(landed, shelf);

        // INFO: AGENTS.md § 0.4. `3장을` and `3개를` are the same sentence, so the particle is picked rather than written.
        // INFO: The finished restructure. The counter follows the **noun**, not the shelf — 갤러리 counts its contents in 장 because they are 사진, which is the axis `toMediaCountUnit` takes.
        if (failedCount > 0) {
          toast.error(`${josa(toCounted(failedCount, shelf), "을/를")} 올리지 못했어요`);
        }

        // WARN: Counted separately from `failedCount` above, because it is a different failure — these did reach R2, and what they never got is the message that would have put them on a shelf.
        if (failedToPostCount > 0) {
          toast.error(
            `${josa(toCounted(failedToPostCount, shelf), "을/를")} 대화에 보내지 못해 보관함에도 담기지 않았어요`,
          );
        }
      } finally {
        setRunningCount((current) => Math.max(current - 1, 0));
      }
    },
    [shelf, onAdded],
  );

  // WARN: `isBusy` outlives `remainingCount`. It stays true through `post`, which is the window in which the batch's bubbles are still landing.
  return { remainingCount, encodeProgress, isBusy: runningCount > 0, upload };
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
 * splitter rather than a second copy of the rule. The server refuses a mixed `media`
 * set, and a drop on the 파일 shelf is exactly how a mixed batch gets here — chunking
 * by count alone posted photos and files in one bubble and took a 400 for it.
 *
 * WARN: § 18. #10. The chunks are posted **in order** — `messages.id` is assigned by
 * the POST, so racing them with a `Promise.all` would reverse them on every other
 * client.
 *
 * WARN: The finished restructure. Registration and attachment happen inside each
 * `postMessage` call now, so `onAdded` fires from here, per row `postMessage` hands
 * back — a row this shelf does not list is still real 보관함 membership and still
 * counted in `landed`, only never prepended.
 */
async function post(
  uploaded: Uploaded[],
  onAdded: (media: ArchiveMedia) => void,
  shelf: LibraryShelf,
): Promise<{ landed: Uploaded[]; failedToPostCount: number }> {
  const bubbles = toBubbles(uploaded, ({ draft }) => toDraftKind(draft));
  const landed: Uploaded[] = [];

  for (const bubble of bubbles) {
    try {
      const { media } = await postMessage({
        clientMsgId: randomId(),
        media: bubble.map(({ upload }) => upload),
      });

      bubble.forEach(({ draft, upload }, position) => {
        landed.push({ draft, upload });

        // INFO: Only the rows this shelf lists are prepended. The others are real and are in 보관함, but `isOfShelf` puts them on a different segment, and pushing one into this list would draw a file card through the 갤러리 grid.
        if (toShelf(draft) === shelf) {
          onAdded(media[position]);
        }
      });
    } catch {
      // WARN: The bubbles are posted in order and stop at the first failure, so everything from here on failed to post too — reporting only the failing bubble would undercount the toast.
      // TODO: A rejection is taken at face value. Registration and attachment are one transaction now, so this is no longer "registered but unattached" — but a response lost after the server already committed still throws here, and the row is really in 보관함 and returns on the next load. Closing it wants the `client_msg_id` reconciliation the § 8.12. send queue has and this path does not.
      return { landed, failedToPostCount: uploaded.length - landed.length };
    }
  }

  return { landed, failedToPostCount: 0 };
}

// INFO: The counter follows the **noun** rather than the shelf — 갤러리 counts its contents in 장 because they are 사진, which is the axis `toMediaCountUnit` takes.
function toCounted(count: number, shelf: LibraryShelf): string {
  return `${count}${toMediaCountUnit(shelf === "gallery" ? "photo" : shelf)}`;
}
