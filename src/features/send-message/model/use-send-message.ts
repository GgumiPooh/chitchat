"use client";

import type { Emoticon } from "@/entities/emoticon";
import type { MediaDraft } from "@/entities/media";
import type { ChatMessage, ReplyPreview } from "@/entities/message";
import { uploadDraft } from "@/features/upload-media/@x/send-message";
import { MAX_MEDIA_PER_MESSAGE } from "@/shared/config";
import { randomId, type Nullable } from "@/shared/lib";
import { useCallback, useRef, useState } from "react";
import { postMessage, type PostMessageParams } from "../api/post-message";

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
  status: "sending" | "failed";
  createdAt: string;
};

export type UseSendMessageParams = {
  onSent: (message: ChatMessage) => void;
};

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
          entry.media.forEach((draft) => URL.revokeObjectURL(draft.previewUrl));

          return false;
        }),
      ),
    [commit],
  );

  const uploadAll = useCallback(
    async (message: PendingMessage): Promise<string[]> => {
      const totalBytes = message.media.reduce((total, draft) => total + draft.file.size, 0);
      const loaded = message.media.map((draft, index) =>
        message.uploadedIds[index] ? draft.file.size : 0,
      );
      const uploaded = [...message.uploadedIds];

      // WARN: `upload.onprogress` fires per network chunk and every patch re-renders the whole virtualized list. A 500MB video would otherwise reconcile it hundreds of times on the device least able to absorb it.
      let lastPercent = -1;

      for (const [index, draft] of message.media.entries()) {
        if (uploaded[index]) {
          continue;
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
        // WARN: Recorded as each one lands, so a failure halfway through leaves the retry nothing to re-upload but the remainder.
        patch(message.clientMsgId, { uploadedIds: [...uploaded] });
      }

      return uploaded.filter((id): id is string => Boolean(id));
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
        patch(clientMsgId, { status: "failed" });
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
      queueRef.current = messages.reduce(
        (queue, message) => queue.then(() => deliver(message)),
        queueRef.current,
      );
    },
    [deliver],
  );

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
      const bubbles = chunk(drafts, MAX_MEDIA_PER_MESSAGE).map((media, index) => ({
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
      void deliver({ ...target, status: "sending" });
    },
    [deliver, patch],
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
  uploadAll: (message: PendingMessage) => Promise<string[]>,
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

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
