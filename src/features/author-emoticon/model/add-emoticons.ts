import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import { revokePreview, toEmoticonImageDraft } from "@/features/upload-media/@x/author-emoticon";
import {
  MAX_EMOTICON_IMAGE_SIZE,
  MAX_UPLOAD_INFLIGHT_BYTES,
  UPLOAD_CONCURRENCY,
  allowedMimesForEmoticonSlot,
  isAllowedEmoticonAsset,
} from "@/shared/config";
import { formatSize, holdAwake, holdUnsentWork, mapPooled } from "@/shared/lib";
import { discardEmoticonAssets, uploadEmoticonAsset } from "../api/upload-emoticon-asset";
import { createEmoticon } from "../api/write-emoticon";

/** REQUIREMENTS.md § 13.4. Named, so the screen can say which file failed rather than how many did. */
export type BulkAddFailure = {
  fileName: string;
  reason: string;
};

export type BulkAddResult = {
  added: Emoticon[];
  failed: BulkAddFailure[];
};

export type BulkAddHandlers = {
  onAdded: (emoticon: Emoticon) => void;
  /** INFO: Fires for a failure too, so the screen's remaining count reaches zero on a pile that did not all land. */
  onSettled?: () => void;
};

type Prepared = { uploadedKey: string; width: number; height: number } | { reason: string };

/**
 * REQUIREMENTS.md § 13.4. A pile of images, one item each — the path that exists so
 * a whole authored set does not have to be added one form at a time. Neither the
 * editor nor the audio slot is offered here; both are single-item decisions, and an
 * item can be given a sound afterwards by editing it.
 *
 * INFO: Uploads run `UPLOAD_CONCURRENCY` wide under a byte budget rather than one at a time; § 13.4. carries the argument for both halves of that limit.
 */
export async function addEmoticonsFromFiles(
  packId: string,
  files: File[],
  { onAdded, onSettled }: BulkAddHandlers,
): Promise<BulkAddResult> {
  const added: Emoticon[] = [];
  const failed: BulkAddFailure[] = [];
  const settle: ((prepared: Prepared) => void)[] = [];
  const preparing = files.map(
    (_, index) =>
      new Promise<Prepared>((resolve) => {
        settle[index] = resolve;
      }),
  );

  // INFO: REQUIREMENTS.md § 15.1. Held here rather than from the screen, which unmounts the moment the user routes away and would take the guarantee with it.
  const release = holdUnsentWork();
  // WARN: REQUIREMENTS.md § 8.4.1. A second hold, against dormancy rather than the reload, and it has to span the whole batch. `uploadEmoticonAsset` releases its own the moment its PUT lands, so once the uploads finish `registerInPickOrder` is a bare run of POSTs with nothing holding the app awake and no pointer or key events under it — twenty files outlast `SSE_IDLE_TIMEOUT` easily, and a dormancy landing mid-loop would refuse every remaining `createEmoticon` *and* the `discardEmoticonAssets` meant to clean up after it, stranding the objects in the bucket.
  const releaseAwake = holdAwake();

  try {
    await Promise.all([
      mapPooled(
        files,
        // WARN: `prepare` is written never to reject, and this guard is what keeps that from being load-bearing — an unsettled deferred would hang `registerInPickOrder` forever, and the screen's remaining count with it.
        async (file, index) => {
          try {
            settle[index](await prepare(file));
          } catch {
            settle[index]({ reason: "업로드하지 못했어요" });
          }
        },
        {
          limit: UPLOAD_CONCURRENCY,
          byteBudget: MAX_UPLOAD_INFLIGHT_BYTES,
          weigh: (file) => file.size,
        },
      ),
      registerInPickOrder(),
    ]);
  } finally {
    release();
    releaseAwake();
  }

  return { added, failed };

  /**
   * WARN: Strictly in pick order, while the uploads feeding it are not.
   * `emoticon_items.sort_order` is assigned from `max(sort_order) + 1` at insert, so
   * registering in completion order would shuffle the pack against what the user picked.
   */
  async function registerInPickOrder() {
    for (const [index, file] of files.entries()) {
      await register(file, await preparing[index]);
    }
  }

  async function register(file: File, prepared: Prepared) {
    if ("reason" in prepared) {
      failed.push({ fileName: file.name, reason: prepared.reason });
      onSettled?.();

      return;
    }

    try {
      const emoticon = await createEmoticon(packId, {
        imageKey: prepared.uploadedKey,
        width: prepared.width,
        height: prepared.height,
      });

      added.push(emoticon);
      onAdded(emoticon);
    } catch {
      // INFO: § 13.3. An object that landed for an item that never got registered is unreachable, so it is given back rather than left in the bucket.
      void discardEmoticonAssets([prepared.uploadedKey]);
      failed.push({ fileName: file.name, reason: "등록하지 못했어요" });
    } finally {
      onSettled?.();
    }
  }
}

/**
 * Reads a picked file and puts its object in R2, answering either the key to
 * register it with or why it will not be registered.
 *
 * WARN: Never rejects. It runs inside `mapPooled`, whose first rejection abandons
 * the batch — every file here has to be able to fail on its own.
 */
async function prepare(file: File): Promise<Prepared> {
  // WARN: Two `try` blocks and not one. A single block cannot tell the two failures apart — the key is only ever assigned by the upload that would have thrown, so it is always unset in the `catch` and every failure reads as an unreadable file (§ 13.4.).
  let draft: MediaDraft;

  try {
    draft = await toEmoticonImageDraft(file);
  } catch {
    return { reason: "파일을 읽지 못했어요" };
  }

  // INFO: The preview is never rendered on this path — the grid reads the registered item back through its asset URL — so it is released as soon as the size has been read off it.
  revokePreview(draft);

  // INFO: REQUIREMENTS.md § 14. A courtesy check, so an oversized file fails before it is uploaded rather than at registration.
  if (!isAllowedEmoticonAsset("image", draft.file.type, draft.file.size)) {
    return { reason: describeRejection(draft.file) };
  }

  try {
    const uploadedKey = await uploadEmoticonAsset("image", draft.file);

    return { uploadedKey, width: draft.width, height: draft.height };
  } catch {
    // INFO: Nothing to discard — an upload that threw never handed back a key, and § 13.3.'s cleanup has nothing to name.
    return { reason: "업로드하지 못했어요" };
  }
}

// INFO: Split by which half of `isAllowedEmoticonAsset` refused it — "8MB를 넘어요" and "지원하지 않는 형식이에요" are acted on differently by whoever reads the list.
function describeRejection(file: Blob): string {
  if (!allowedMimesForEmoticonSlot("image").includes(file.type)) {
    return "지원하지 않는 형식이에요";
  }

  return `${formatSize(MAX_EMOTICON_IMAGE_SIZE)}를 넘어요`;
}
