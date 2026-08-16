import {
  getMessage,
  listMessageInlineEmoticons,
  listMessages,
  type ChatMessage,
} from "@/entities/message";
import { apiError } from "@/shared/api";
import { getSessionContext, isSessionLive } from "@/shared/auth";
import {
  BACKFILL_EVENT,
  BUILD_ID,
  CHANGE_EVENT,
  snowflakeSchema,
  SSE_HEARTBEAT_INTERVAL,
  SSE_REPLAY_LIMIT,
  SSE_REPLAY_MARGIN,
  typingEventSchema,
  type InlineEmoticonMap,
  type MessageArrival,
} from "@/shared/config";
import {
  listenToChannels,
  MESSAGE_CHANGED_CHANNEL,
  NEW_MESSAGE_CHANNEL,
  TYPING_CHANNEL,
  USER_CHANGED_CHANNEL,
} from "@/shared/db";
import {
  idFloorBefore,
  isSnowflake,
  safelyGet,
  safelyRun,
  toId,
  type MessageId,
  type Nullable,
  type Optional,
} from "@/shared/lib";
import { z } from "zod";

// WARN: The stream holds a `LISTEN` connection open, which the edge runtime cannot do.
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

// INFO: REQUIREMENTS.md § 15. The client's `EventSource` reconnects on its own when the platform ends the invocation, and `Last-Event-ID` makes that reconnect lossless.
export const maxDuration = 60;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // WARN: A buffering reverse proxy holds the whole body until the stream ends, which is never.
  "X-Accel-Buffering": "no",
} as const;

// INFO: REQUIREMENTS.md § 6. `NOTIFY` caps at 8000 bytes, so the payload is an id and the row is read back here.
const newMessageSchema = z.object({
  id: snowflakeSchema<MessageId>(),
});

/**
 * REQUIREMENTS.md § 8.4. One endpoint, one `EventSource`, four channels — the
 * `user_changed`, `typing` and `message_changed` `LISTEN`s ride the connection
 * this stream already holds rather than opening a stream each.
 */
export async function GET(request: Request) {
  // INFO: The session row, not just the user — this connection outlives its own authentication, and the heartbeat below re-asks whether it is still valid (REQUIREMENTS.md § 12.).
  const context = await getSessionContext();

  if (!context) {
    return apiError("unauthorized");
  }

  const sessionId = context.session.id;
  const cursor = parseCursor(request.headers.get("Last-Event-ID"));
  const encoder = new TextEncoder();
  const ended = new AbortController();

  request.signal.addEventListener("abort", () => ended.abort(), { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let isOpen = true;
      let release: Optional<() => Promise<void>>;
      // INFO: Serialized behind one promise chain — each notification costs a query, and letting them interleave would emit the rows out of id order.
      let pipeline: Promise<void> = Promise.resolve();
      const heartbeat = setInterval(() => void beat(), SSE_HEARTBEAT_INTERVAL);

      // WARN: REQUIREMENTS.md § 15.1. First, ahead of the replay. An iOS PWA resumes into an old bundle, and every reconnect is a resume — so a stale client learns it is stale before it renders anything the new deployment may have changed. No `id:`, for the same reason `user` carries none.
      write(`event: build\ndata: ${JSON.stringify({ id: BUILD_ID })}\n\n`);

      try {
        // WARN: Registered before the replay query runs. In the other order a message committing between the two would be missed by both — the query does not see it yet and nothing is listening for it.
        release = await listenToChannels(
          [NEW_MESSAGE_CHANNEL, USER_CHANGED_CHANNEL, TYPING_CHANNEL, MESSAGE_CHANGED_CHANNEL],
          handleNotification,
        );

        const replay = await replayFrom(cursor);
        // INFO: REQUIREMENTS.md § 13. One query for the whole replay, and each event then carries only the entries its own row names — the alternative is a query per replayed message on every reconnect.
        const replayEmoticons = await listMessageInlineEmoticons(replay);

        for (const message of replay) {
          write(toMessageEvent(message, "backfill", pickEmoticons(replayEmoticons, message)));
        }

        await whenAborted(ended.signal);
      } finally {
        isOpen = false;
        clearInterval(heartbeat);
        await release?.();
        // INFO: Already closed when the client is the one who hung up.
        safelyRun(() => controller.close());
      }

      function write(chunk: string) {
        if (isOpen) {
          safelyRun(() => controller.enqueue(encoder.encode(chunk)));
        }
      }

      /**
       * REQUIREMENTS.md § 12. Revocation has to reach a stream that is already open.
       * This connection authenticated once and is held for as long as the tab is, so
       * without the re-ask a signed-out device keeps reading the conversation live
       * until it happens to reconnect — which an active one never does.
       *
       * WARN: A named event, not a `:ping` comment — a comment keeps proxies awake but
       * is invisible to `EventSource`, and the client needs to see the heartbeat to
       * tell a live socket from an iOS-frozen one (§ 8.4.). No `id:`, for the same
       * reason `user` carries none.
       */
      async function beat() {
        if (!(await isSessionLive(sessionId))) {
          ended.abort();

          return;
        }

        write("event: ping\ndata: {}\n\n");
      }

      function handleNotification(channel: string, payload: string) {
        if (channel === USER_CHANGED_CHANNEL) {
          // WARN: No `id:` field. The reconnect cursor is a `messages` bigserial and a user event has no counterpart, so anything here would hand the next reconnect a garbage replay bound (REQUIREMENTS.md § 8.4.).
          write("event: user\ndata: {}\n\n");

          return;
        }

        if (channel === TYPING_CHANNEL) {
          // INFO: REQUIREMENTS.md § 8.12. Unlike the two other channels this payload is the whole event — there is no row to read back, and a uuid is nowhere near the 8000-byte cap.
          const typing = typingEventSchema.safeParse(safelyGet(() => JSON.parse(payload)));

          if (typing.success) {
            // WARN: No `id:`, and never queued behind the pipeline below. It carries no `messages` cursor to advance, and a signal that only means "right now" must not wait on a chain of row reads that would deliver it after it expired (REQUIREMENTS.md § 8.12.).
            write(`event: typing\ndata: ${JSON.stringify(typing.data)}\n\n`);
          }

          return;
        }

        const notification = newMessageSchema.safeParse(safelyGet(() => JSON.parse(payload)));

        if (!notification.success) {
          return;
        }

        enqueue(notification.data.id, channel === MESSAGE_CHANGED_CHANNEL);
      }

      /**
       * WARN: REQUIREMENTS.md § 8.13. A mutation rides the same serialized chain an
       * arrival does, never beside it. Both channels can fire for one row within a
       * millisecond of each other, and a delete written ahead of the `getMessage` an
       * insert already had in flight is a bubble the reader watches come back.
       */
      function enqueue(id: MessageId, isMutation: boolean) {
        // WARN: The `catch` keeps the chain alive — a rejection left on it would silence every later notification on this stream.
        pipeline = pipeline
          .then(async () => {
            const message = await getMessage(id);

            // INFO: REQUIREMENTS.md § 8.13. `null` now means the id names no row at all, which is nothing to report on either channel — a deletion resolves normally and arrives as a row whose `isDeleted` is set.
            if (message) {
              const emoticons = await listMessageInlineEmoticons([message]);

              write(
                isMutation
                  ? toChangeEvent(message, emoticons)
                  : toMessageEvent(message, "live", emoticons),
              );
            }
          })
          .catch(() => undefined);
      }
    },
    cancel() {
      ended.abort();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * REQUIREMENTS.md § 8.4. `id:` rides message events only — it is the reconnect cursor.
 *
 * INFO: The replay is a separate event name because a replayed row is not news to
 * the client, and § 13.6.'s emoticon sound must not fire for a message the user
 * has already been shown.
 */
function toMessageEvent(
  message: ChatMessage,
  arrival: MessageArrival,
  emoticons: InlineEmoticonMap,
): string {
  const event = arrival === "live" ? "message" : BACKFILL_EVENT;

  // INFO: REQUIREMENTS.md § 13. The single-row form of the payload every other read path answers — the row, and what its text stands in.
  return `event: ${event}\nid: ${message.id}\ndata: ${JSON.stringify({ message, emoticons })}\n\n`;
}

// INFO: The entries one row names, out of a map resolved for a whole replay.
function pickEmoticons(emoticons: InlineEmoticonMap, message: ChatMessage): InlineEmoticonMap {
  const picked: InlineEmoticonMap = {};

  for (const itemId of message.inlineEmoticonItemIds) {
    const emoticon = emoticons[itemId];

    if (emoticon) {
      picked[itemId] = emoticon;
    }
  }

  return picked;
}

/**
 * REQUIREMENTS.md § 8.13. The changed row — corrected, or withdrawn and now a
 * tombstone — carrying the same payload an arrival does, so the client replaces
 * what it holds rather than reading a patch. Which of the two it is rides on the
 * row's own `isDeleted`.
 *
 * WARN: Its own event name, so none of an arrival's side effects fire: the row is
 * already on screen, so the unread count must not move, § 13.6.'s sound must not
 * play, and § 8.8.'s cursor must not be written for it.
 *
 * WARN: No `id:`. A change names a row of any age, and stamping the cursor with it
 * would walk `Last-Event-ID` backwards into a replay the client already has.
 */
function toChangeEvent(message: ChatMessage, emoticons: InlineEmoticonMap): string {
  return `event: ${CHANGE_EVENT}\ndata: ${JSON.stringify({ message, emoticons })}\n\n`;
}

async function replayFrom(cursor: Nullable<MessageId>): Promise<ChatMessage[]> {
  if (cursor === null) {
    return [];
  }

  return listMessages({
    after: idFloorBefore(cursor, SSE_REPLAY_MARGIN),
    limit: SSE_REPLAY_LIMIT,
  });
}

function parseCursor(header: Nullable<string>): Nullable<MessageId> {
  return header && isSnowflake(header) ? toId<MessageId>(header) : null;
}

function whenAborted(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();

      return;
    }

    signal.addEventListener("abort", () => resolve(), { once: true });
  });
}
