import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import {
  revokePreview,
  toEmoticonImageDrafts,
  type EmoticonImageDrafts,
} from "@/features/upload-media/@x/author-emoticon";
import {
  MAX_EMOTICON_IMAGE_SIZE,
  MAX_UPLOAD_INFLIGHT_BYTES,
  UPLOAD_CONCURRENCY,
  allowedMimesForEmoticonSlot,
  isAllowedEmoticonAsset,
  type EmoticonImageSlot,
} from "@/shared/config";
import type { EmoticonPackId, Nullable } from "@/shared/lib";
import { formatSize, holdAwake, holdUnsentWork, mapPooled } from "@/shared/lib";
import { josa } from "es-hangul";
import { discardEmoticonAssets, uploadEmoticonAsset } from "../api/upload-emoticon-asset";
import { createEmoticon, type EmoticonImageBody } from "../api/write-emoticon";

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

// INFO: One item per file, filled the way the form fills one — an animated file lands in both slots and a static one in the still alone.
type PreparedImages = {
  still: EmoticonImageBody;
  animated: Nullable<EmoticonImageBody>;
};

type Prepared = PreparedImages | { reason: string };

/**
 * REQUIREMENTS.md § 13.4. A pile of images, one item each — the path that exists so
 * a whole authored set does not have to be added one form at a time. Neither the
 * editor nor the audio slot is offered here; both are single-item decisions, and an
 * item can be given a sound afterwards by editing it.
 *
 * INFO: Uploads run `UPLOAD_CONCURRENCY` wide under a byte budget rather than one at a time; § 13.4. carries the argument for both halves of that limit.
 */
export async function addEmoticonsFromFiles(
  packId: EmoticonPackId,
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
        still: prepared.still,
        ...(prepared.animated ? { animated: prepared.animated } : {}),
      });

      added.push(emoticon);
      onAdded(emoticon);
    } catch {
      // INFO: § 13.3. An object that landed for an item that never got registered is unreachable, so it is given back rather than left in the bucket.
      void discardEmoticonAssets(toKeys(prepared));
      failed.push({ fileName: file.name, reason: "등록하지 못했어요" });
    } finally {
      onSettled?.();
    }
  }
}

/**
 * Reads a picked file and puts its objects in R2, answering either what to register
 * the item with or why it will not be registered.
 *
 * WARN: Never rejects. It runs inside `mapPooled`, whose first rejection abandons
 * the batch — every file here has to be able to fail on its own.
 */
async function prepare(file: File): Promise<Prepared> {
  // WARN: Two `try` blocks and not one. A single block cannot tell the two failures apart — a key is only ever assigned by the upload that would have thrown, so every failure would read as an unreadable file (§ 13.4.).
  let upload: EmoticonImageDrafts;

  try {
    upload = await toEmoticonImageDrafts(file);
  } catch {
    return { reason: "파일을 읽지 못했어요" };
  }

  const slots = toSlotDrafts(upload);

  // INFO: The previews are never rendered on this path — the grid reads the registered item back through its asset URL — so they are released as soon as the sizes have been read off them.
  slots.forEach(([, draft]) => revokePreview(draft));

  for (const [slot, draft] of slots) {
    // INFO: REQUIREMENTS.md § 14. A courtesy check, so an oversized file fails before it is uploaded rather than at registration.
    if (!isAllowedEmoticonAsset(slot, draft.file.type, draft.file.size)) {
      return { reason: describeRejection(slot, draft.file) };
    }
  }

  const uploaded: string[] = [];

  try {
    const still = await uploadImage(uploaded, "still-image", upload.still);
    const animated = upload.animated
      ? await uploadImage(uploaded, "animated-image", upload.animated)
      : null;

    return { still, animated };
  } catch {
    // INFO: § 13.3. An animated file puts two objects in the bucket, so a still that landed before its sibling failed is referenced by nothing and has to be given back.
    void discardEmoticonAssets(uploaded);

    return { reason: "업로드하지 못했어요" };
  }
}

/** INFO: `uploaded` is appended to as each object lands, so a failure halfway through can name what is already in the bucket. */
async function uploadImage(
  uploaded: string[],
  slot: EmoticonImageSlot,
  draft: MediaDraft,
): Promise<EmoticonImageBody> {
  const key = await uploadEmoticonAsset(slot, draft.file);

  uploaded.push(key);

  return { key, width: draft.width, height: draft.height };
}

function toSlotDrafts({ still, animated }: EmoticonImageDrafts): [EmoticonImageSlot, MediaDraft][] {
  const slots: [EmoticonImageSlot, MediaDraft][] = [["still-image", still]];

  return animated ? [...slots, ["animated-image", animated]] : slots;
}

function toKeys({ still, animated }: PreparedImages): string[] {
  return animated ? [still.key, animated.key] : [still.key];
}

// INFO: Split by which half of `isAllowedEmoticonAsset` refused it — "8MB를 넘어요" and "지원하지 않는 형식이에요" are acted on differently by whoever reads the list.
function describeRejection(slot: EmoticonImageSlot, file: Blob): string {
  if (!allowedMimesForEmoticonSlot(slot).includes(file.type)) {
    return "지원하지 않는 형식이에요";
  }

  // WARN: CLAUDE.md § 0.4. The particle follows an interpolated value, so `josa` chooses it — `8MB` reads vowel-final and `1GB` does not, and a baked `를` is wrong the day the ceiling moves.
  return `${josa(formatSize(MAX_EMOTICON_IMAGE_SIZE), "을/를")} 넘어요`;
}
