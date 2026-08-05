import { getMessage, listMessages, type ChatMessage } from "@/entities/message";
import { getCurrentUser } from "@/shared/auth";
import {
  BACKFILL_EVENT,
  BUILD_ID,
  SSE_HEARTBEAT_INTERVAL,
  SSE_REPLAY_LIMIT,
  SSE_REPLAY_MARGIN,
  type MessageArrival,
} from "@/shared/config";
import { listenToChannels, NEW_MESSAGE_CHANNEL, USER_CHANGED_CHANNEL } from "@/shared/db";
import { safelyGet, safelyRun, type Nullable, type Optional } from "@/shared/lib";
import { NextResponse } from "next/server";
import { z } from "zod";

// WARN: The stream holds a `LISTEN` connection open, which the edge runtime cannot do.
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

// INFO: REQUIREMENTS.md § 15. The client's `EventSource` reconnects on its own when the platform ends the invocation, and `Last-Event-ID` makes that reconnect lossless.
export const maxDuration = 300;

const SSE_HEADERS = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  Connection: "keep-alive",
  // WARN: A buffering reverse proxy holds the whole body until the stream ends, which is never.
  "X-Accel-Buffering": "no",
} as const;

// INFO: REQUIREMENTS.md § 6. `NOTIFY` caps at 8000 bytes, so the payload is an id and the row is read back here.
const newMessageSchema = z.object({
  id: z.number().int().positive(),
});

/**
 * REQUIREMENTS.md § 8.4. One endpoint, one `EventSource`, two channels — the
 * `user_changed` `LISTEN` rides the connection this stream already holds rather
 * than opening a second stream.
 */
export async function GET(request: Request) {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

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
      // WARN: A named event, not a `:ping` comment — a comment keeps proxies awake but is invisible to `EventSource`, and the client needs to see the heartbeat to tell a live socket from an iOS-frozen one (§ 8.4.). No `id:`, for the same reason `user` carries none.
      const heartbeat = setInterval(
        () => write("event: ping\ndata: {}\n\n"),
        SSE_HEARTBEAT_INTERVAL,
      );

      // WARN: REQUIREMENTS.md § 15.1. First, ahead of the replay. An iOS PWA resumes into an old bundle, and every reconnect is a resume — so a stale client learns it is stale before it renders anything the new deployment may have changed. No `id:`, for the same reason `user` carries none.
      write(`event: build\ndata: ${JSON.stringify({ id: BUILD_ID })}\n\n`);

      try {
        // WARN: Registered before the replay query runs. In the other order a message committing between the two would be missed by both — the query does not see it yet and nothing is listening for it.
        release = await listenToChannels(
          [NEW_MESSAGE_CHANNEL, USER_CHANGED_CHANNEL],
          handleNotification,
        );

        for (const message of await replayFrom(cursor)) {
          write(toMessageEvent(message, "backfill"));
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

      function handleNotification(channel: string, payload: string) {
        if (channel === USER_CHANGED_CHANNEL) {
          // WARN: No `id:` field. The reconnect cursor is a `messages` bigserial and a user event has no counterpart, so anything here would hand the next reconnect a garbage replay bound (REQUIREMENTS.md § 8.4.).
          write("event: user\ndata: {}\n\n");

          return;
        }

        const notification = newMessageSchema.safeParse(safelyGet(() => JSON.parse(payload)));

        if (!notification.success) {
          return;
        }

        enqueue(notification.data.id);
      }

      function enqueue(id: number) {
        // WARN: The `catch` keeps the chain alive — a rejection left on it would silence every later notification on this stream.
        pipeline = pipeline
          .then(async () => {
            const message = await getMessage(id);

            if (message) {
              write(toMessageEvent(message, "live"));
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
function toMessageEvent(message: ChatMessage, arrival: MessageArrival): string {
  const event = arrival === "live" ? "message" : BACKFILL_EVENT;

  return `event: ${event}\nid: ${message.id}\ndata: ${JSON.stringify(message)}\n\n`;
}

async function replayFrom(cursor: Nullable<number>): Promise<ChatMessage[]> {
  if (cursor === null) {
    return [];
  }

  return listMessages({
    after: Math.max(cursor - SSE_REPLAY_MARGIN, 0),
    limit: SSE_REPLAY_LIMIT,
  });
}

function parseCursor(header: Nullable<string>): Nullable<number> {
  const value = Number(header);

  return header && Number.isSafeInteger(value) && value > 0 ? value : null;
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
