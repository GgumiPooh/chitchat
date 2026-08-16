"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import type { ChatMessage, ReplyPreview } from "@/entities/message";
import { revokePreview, uploadDraft } from "@/features/upload-media/@x/send-message";
import { MAX_UPLOAD_INFLIGHT_BYTES, UPLOAD_CONCURRENCY } from "@/shared/config";
import {
  getLastNetworkFailedAt,
  getLastNetworkReachedAt,
  holdAwake,
  isVoiceActive,
  mapPooled,
  randomId,
  stopVoice,
  useBfcacheRestore,
  type MediaId,
  type Nullable,
} from "@/shared/lib";
import { useSnapshot, useSnapshotOwner, useWriteSnapshot } from "@/shared/snapshot";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { postMessage, type PostMessageParams } from "../api/post-message";
import { toBubbles, toDraftKind } from "./to-bubbles";

/** An outgoing message the server has not echoed back yet (REQUIREMENTS.md § 8.5.). */
export type PendingMessage = {
  clientMsgId: string;
  text: Nullable<string>;
  media: MediaDraft[];
  // INFO: REQUIREMENTS.md § 13.6. Carried on the pending row so the optimistic bubble renders the art immediately — the asset is already in the browser's cache from the picker.
  emoticon: Nullable<Emoticon>;
  // INFO: REQUIREMENTS.md § 8.10. Carried on the pending row so the optimistic bubble quotes immediately — the client staged the preview, so nothing has to be fetched to draw it.
  replyTo: Nullable<ReplyPreview>;
  // WARN: Indexed alongside `media`. A retry re-uploads only the slots still null, so a failure on the last of nine photos does not re-send the eight that landed.
  uploadedIds: Nullable<string>[];
  /** `0`–`1` across the whole bubble's bytes. Meaningless for a text message. */
  progress: number;
  /**
   * WARN: `queued` is its own member rather than a flag beside `sending`, and § 15.1. is why. `useUnsentWork` holds a deploy-forced reload open for whatever is in flight, and a bubble waiting on the network finishes no more on its own than a failed one does — counted as `sending` it pins the app to a stale bundle for as long as the tunnel lasts.
   */
  status: "sending" | "queued" | "failed";
  createdAt: string;
};

export type UseSendMessageParams = {
  onSent: (message: ChatMessage) => void;
};

/**
 * REQUIREMENTS.md § 16. The queued rows that survive the tab, so a tunnel plus a
 * reload is not silent message loss.
 *
 * WARN: Text and emoticons alone — a media row is deliberately never stored, for two independent reasons. Its `MediaDraft[]` holds real `File` objects, and `writeSnapshot` serialises through `JSON.stringify`, which turns a `File` into `{}` — so a restored media bubble would carry N empty attachments and nothing to upload. Reviving the half-finished upload behind it would also mean reviving § 9.'s presigned PUTs, which have expired by then.
 */
function toDurableQueue(pending: PendingMessage[]): PendingMessage[] {
  return pending.filter((entry) => entry.status === "queued" && entry.media.length === 0);
}

/**
 * Optimistic sending. The bubble is rendered from `pending` the moment the user
 * hits send and is handed over to `onSent` once the row exists; a failure keeps
 * it in the list so § 8.5.'s retry affordance has something to retry.
 */
export function useSendMessage({ onSent }: UseSendMessageParams) {
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const pendingRef = useRef<PendingMessage[]>([]);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  const commit = useCallback((update: (previous: PendingMessage[]) => PendingMessage[]) => {
    pendingRef.current = update(pendingRef.current);
    setPending(pendingRef.current);
  }, []);

  const patch = useCallback(
    (clientMsgId: string, changes: Partial<PendingMessage>) =>
      commit((previous) =>
        previous.map((entry) =>
          entry.clientMsgId === clientMsgId ? { ...entry, ...changes } : entry,
        ),
      ),
    [commit],
  );

  /** Retires a pending bubble — sent, or cancelled from the § 6.5. failure affordance. */
  const drop = useCallback(
    (clientMsgId: string) =>
      commit((previous) =>
        previous.filter((entry) => {
          if (entry.clientMsgId !== clientMsgId) {
            return true;
          }

          // WARN: The last owner of these object URLs. `useMediaSelection.takeAll` handed them over precisely so the optimistic bubble could keep rendering, so nothing else will free them.
          // WARN: REQUIREMENTS.md § 9.3. A voice draft's preview is the URL the shared player is parked on, so it has to be released **before** it is revoked — `stopVoice`'s own `load()` would otherwise run against a dead blob and log a media error. Guarded on this source being the active one, or retiring my own upload would cut off an older voice note the reader is listening to.
          entry.media.forEach((draft) => {
            if (isVoiceActive(draft.previewUrl)) {
              stopVoice();
            }

            revokePreview(draft);
          });

          return false;
        }),
      ),
    [commit],
  );

  const uploadAll = useCallback(
    async (message: PendingMessage): Promise<MediaId[]> => {
      const totalBytes = message.media.reduce((total, draft) => total + draft.file.size, 0);
      const loaded = message.media.map((draft, index) =>
        message.uploadedIds[index] ? draft.file.size : 0,
      );
      const uploaded = [...message.uploadedIds];

      // WARN: `upload.onprogress` fires per network chunk and every patch re-renders the whole virtualized list. A 500MB video would otherwise reconcile it hundreds of times on the device least able to absorb it.
      let lastPercent = -1;

      // WARN: The byte budget is doing the work here, not the concurrency limit — nine slots of `MAX_VIDEO_SIZE` is what this path can be handed, and § 13.4.'s reason for not firing those at once still stands. Nine small photos do go out `UPLOAD_CONCURRENCY` wide.
      await mapPooled(
        message.media,
        async (draft, index) => {
          if (uploaded[index]) {
            return;
          }

          const media = await uploadDraft(draft, {
            onProgress: (loadedBytes) => {
              loaded[index] = loadedBytes;

              const progress = sum(loaded) / Math.max(totalBytes, 1);
              const percent = Math.round(progress * 100);

              if (percent === lastPercent) {
                return;
              }

              lastPercent = percent;
              patch(message.clientMsgId, { progress });
            },
          });

          uploaded[index] = media.id;
          loaded[index] = draft.file.size;
          // WARN: Recorded as each one lands, so a failure halfway through leaves the retry nothing to re-upload but the remainder. `mapPooled` settles everything in flight before it rethrows precisely so this holds.
          patch(message.clientMsgId, { uploadedIds: [...uploaded] });
        },
        {
          limit: UPLOAD_CONCURRENCY,
          byteBudget: MAX_UPLOAD_INFLIGHT_BYTES,
          // INFO: A slot the retry is skipping costs nothing to run, so its bytes must not be reserved against the budget either.
          weigh: (draft, index) => (uploaded[index] ? 0 : draft.file.size),
        },
      );

      // WARN: Indexed, so `mediaIds` stays in the picked order however the uploads interleaved — § 6. renders the grid in exactly this order.
      return uploaded.filter((id): id is MediaId => Boolean(id));
    },
    [patch],
  );

  /**
   * INFO: REQUIREMENTS.md § 8.5. The SSE echo of my own message routinely beats the
   * POST response, so whichever arrives first retires the optimistic bubble.
   */
  const deliver = useCallback(
    async (message: PendingMessage) => {
      const { clientMsgId } = message;

      try {
        const sent = await postMessage(await toPostParams(message, uploadAll));

        onSent(sent);
        drop(clientMsgId);
      } catch {
        // WARN: `navigator.onLine` rather than `useIsOffline`, whose settle delay is the whole second this decision is made in — read through the hook, a send that fails the instant the network goes is filed as refused.
        // WARN: And never that flag alone. `postMessage` throws for a rejected *status* as well as for a dead network, so on a device where the flag sticks false — the VPN and VM case this codebase cites throughout — a message the server refused was filed `queued`, which renders no 다시 보내기 and leaves 전송 취소 as the only way out of a bubble nothing will ever retry. `markNetworkReached` fires on a status of any kind, so this tells the two apart by what the request actually did.
        const isUnreachable = getLastNetworkFailedAt() > getLastNetworkReachedAt();

        patch(clientMsgId, {
          status: !navigator.onLine && isUnreachable ? "queued" : "failed",
        });
      }
    },
    [drop, onSent, patch, uploadAll],
  );

  /**
   * WARN: One chain across every send, not one per call. `messages.id` is assigned
   * by the POST, so a text sent alongside attachments would otherwise outrun the
   * uploads and land above the photos it captions on every other client and every
   * reload — the opposite of the order it was optimistically rendered in.
   */
  const enqueue = useCallback(
    (messages: PendingMessage[]) => {
      // WARN: REQUIREMENTS.md § 8.4.1. A send is a task in flight the idle timer cannot see — it produces no `pointerdown` and no `keydown`, and going dormant mid-chain would close the request gate between an uploaded photo and the POST that would have referenced it.
      const release = holdAwake();

      queueRef.current = messages
        .reduce((queue, message) => queue.then(() => deliver(message)), queueRef.current)
        .finally(release);
    },
    [deliver],
  );

  /**
   * What makes an offline send a send rather than an error — the outbox above holds
   * the bubble, and this is the half that empties it.
   *
   * WARN: It does **not** test `navigator.onLine`, and must not. That flag is a hint (`AGENTS.md § 4.2.`) and it sticks false on a VPN, a VM and several Linux stacks — consulted here it would strand a queued bubble for good, since `queued` deliberately renders no 다시 보내기 and 전송 취소 would be the only way out. The cost of trying while genuinely offline is one rejected fetch that `deliver` re-files as `queued`.
   * WARN: Idempotent through the ref, which is what lets three triggers share it. `patch` writes `pendingRef.current` **synchronously**, so a second call in the same tick — or one landing while a flush is still delivering — finds those rows already `sending` and filters them out. Nothing here may become async before that `forEach`.
   */
  const flushQueued = useCallback(() => {
    const queued = pendingRef.current.filter((entry) => entry.status === "queued");

    if (queued.length === 0) {
      return;
    }

    queued.forEach(({ clientMsgId }) => patch(clientMsgId, { status: "sending" }));
    enqueue(queued.map((entry) => ({ ...entry, status: "sending" as const })));
  }, [enqueue, patch]);

  useEffect(() => {
    // WARN: `visibilitychange` and not `focus`. An iOS PWA resumed from suspension is the case with no `online` behind it, and it reports visibility rather than focus.
    const resume = () => document.visibilityState === "visible" && flushQueued();

    window.addEventListener("online", flushQueued);
    document.addEventListener("visibilitychange", resume);

    return () => {
      window.removeEventListener("online", flushQueued);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [flushQueued]);

  // WARN: A restore replays no render and fires neither of the two above, so without this a tab that left 채팅 and came back holds an outbox nothing empties — and `queued` deliberately renders no 다시 보내기, so 전송 취소 would be the only way out.
  useBfcacheRestore(flushQueued);

  // WARN: Memoized, and not a convenience. `useWriteSnapshot` keys its 2s debounce on the payload's identity, so a fresh array per render restarts that timer every render — and this hook lives in a screen the virtualizer re-renders constantly, where the write would then never fire at all. `pending` changes identity only on a commit, which is exactly when the queue can have moved.
  const durableQueue = useMemo(() => toDurableQueue(pending), [pending]);

  const owner = useSnapshotOwner();

  // INFO: REQUIREMENTS.md § 16. Level with the outbox on every change, so the queue outlives the tab rather than the render.
  useWriteSnapshot(owner, "outbox", durableQueue);

  // WARN: The same owner the write above uses, never `useSnapshot`'s `localStorage` default. This one is read *inside* a signed-in tree, and two browsing contexts share that key — a restore taken from it revives the other account's queued rows, which `flushQueued` then posts under this session.
  const restored = useSnapshot<PendingMessage[]>("outbox", owner);
  const hasRestoredRef = useRef(false);

  /**
   * WARN: Latched to one pass, because `flushQueued` can change identity and re-run
   * this. A second pass lands after the first has already sent and dropped those rows,
   * so `pendingRef` no longer holds them and the id check below waves them through —
   * resurrecting bubbles that are already delivered. § 8.5.'s `clientMsgId` keeps the
   * server from storing them twice; it cannot keep them off this screen.
   */
  useEffect(() => {
    if (hasRestoredRef.current || restored.status !== "hit" || restored.payload.length === 0) {
      return;
    }

    hasRestoredRef.current = true;

    const known = new Set(pendingRef.current.map((entry) => entry.clientMsgId));
    const revived = restored.payload.filter((entry) => !known.has(entry.clientMsgId));

    if (revived.length === 0) {
      return;
    }

    commit((previous) => [...revived, ...previous]);
    // INFO: The stored rows are older than anything this mount has staged, so they go in front and the flush sends them in that order.
    flushQueued();
  }, [restored, commit, flushQueued]);

  const send = useCallback(
    (text: string, replyTo: Nullable<ReplyPreview> = null) => {
      const trimmed = text.trim();

      if (!trimmed) {
        return;
      }

      const message = { ...createPending(trimmed, []), replyTo };

      commit((previous) => [...previous, message]);
      enqueue([message]);
    },
    [commit, enqueue],
  );

  /**
   * INFO: REQUIREMENTS.md § 18. #10. Selection is unlimited, so a long send becomes
   * consecutive bubbles rather than one grid with a `+N` cell hiding the rest. They
   * are delivered one after another, so the conversation reads in the picked order.
   */
  const sendMedia = useCallback(
    (drafts: MediaDraft[], replyTo: Nullable<ReplyPreview> = null) => {
      // WARN: REQUIREMENTS.md § 8.10. The quote goes on the first bubble alone. A pick of twenty photos is three bubbles, and repeating the quote on each would draw the same sentence three times in a row.
      const bubbles = toBubbles(drafts, toDraftKind).map((media, index) => ({
        ...createPending(null, media),
        replyTo: index === 0 ? replyTo : null,
      }));

      if (bubbles.length === 0) {
        return;
      }

      commit((previous) => [...previous, ...bubbles]);
      enqueue(bubbles);
    },
    [commit, enqueue],
  );

  /** INFO: REQUIREMENTS.md § 13.6. Nothing to upload, so the staged emoticon joins the queue as a bubble that is already complete. */
  const sendEmoticon = useCallback(
    (emoticon: Emoticon, replyTo: Nullable<ReplyPreview> = null) => {
      const message = { ...createPending(null, []), emoticon, replyTo };

      commit((previous) => [...previous, message]);
      enqueue([message]);
    },
    [commit, enqueue],
  );

  const retry = useCallback(
    (clientMsgId: string) => {
      const target = pendingRef.current.find((entry) => entry.clientMsgId === clientMsgId);

      if (!target || target.status === "sending") {
        return;
      }

      patch(clientMsgId, { status: "sending" });
      // WARN: Through `enqueue` rather than straight to `deliver`. The single chain is what stops a text outrunning the attachments it captions, and `enqueue` is also where REQUIREMENTS.md § 8.4.1.'s `holdAwake` is taken — delivered bare, a retry could go dormant between an uploaded photo and the POST that references it.
      enqueue([{ ...target, status: "sending" }]);
    },
    [enqueue, patch],
  );

  return { pending, send, sendMedia, sendEmoticon, retry, cancel: drop, resolve: drop };
}

function createPending(text: Nullable<string>, media: MediaDraft[]): PendingMessage {
  return {
    // INFO: REQUIREMENTS.md § 8.5. Client-generated, so the retry above collides with the first attempt instead of duplicating it.
    clientMsgId: randomId(),
    text,
    media,
    emoticon: null,
    replyTo: null,
    uploadedIds: media.map(() => null),
    progress: 0,
    status: "sending",
    createdAt: new Date().toISOString(),
  };
}

// INFO: REQUIREMENTS.md § 6. A row is text, attachments, or one emoticon — never a combination, which is what the table's CHECK constraint says too.
async function toPostParams(
  message: PendingMessage,
  uploadAll: (message: PendingMessage) => Promise<MediaId[]>,
): Promise<PostMessageParams> {
  const { clientMsgId } = message;
  const replyToId = message.replyTo?.id;

  if (message.emoticon) {
    return { clientMsgId, replyToId, emoticonItemId: message.emoticon.id };
  }

  if (message.text === null) {
    return { clientMsgId, replyToId, mediaIds: await uploadAll(message) };
  }

  return { clientMsgId, replyToId, text: message.text };
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
