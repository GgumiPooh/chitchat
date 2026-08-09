"use client";

import type { ChatTrackMedia } from "@/entities/media";
import { CHAT_MEDIA_TRACK_SPAN, type ChatTrackEdge } from "@/shared/config";
import type { Nullable, Optional } from "@/shared/lib";
import type { MediaCell } from "@/shared/ui";
import { useCallback, useMemo, useRef, useState } from "react";
import { fetchConversationMedia } from "../api/fetch-conversation-media";
import { toBubbleOwners, toCellsFromTrack, toTrackOwners, type TrackOwner } from "./to-media-cells";

/**
 * REQUIREMENTS.md § 8.1. The § 7.10. viewer's track as 채팅 holds it — the loaded
 * window of the conversation's photos and videos, rather than the bubble it was
 * opened from.
 *
 * INFO: `owners` is what the per-slide controls are resolved through — which bubble carries the slide on screen, and who sent it. The delete is gated on the sender (§ 8.13. withdraws my own messages only) and 대화에서 보기 travels to the message.
 * WARN: A map rather than a `messageId` for the whole open, which is what this held while the track was one bubble. Every slide can now name a different message, so a single id would offer 메시지 삭제 for whichever bubble the reader happened to tap first — pointed at a message that is no longer on screen.
 * WARN: § 8.13. Every slide's message is kept here, not only the deletable ones. A withdrawal reaching the other participant's attachments has to take their slides out of the track, and a map of my own messages could never match it.
 */
export type ViewerTrack = {
  cells: MediaCell[];
  index: number;
  owners: Map<string, TrackOwner>;
};

type HeldPages = Record<ChatTrackEdge, ChatTrackMedia[]>;

/**
 * REQUIREMENTS.md § 8.1. Owns the rows of 채팅's viewer track: the window it opens on,
 * the pages that extend it at either edge, and the narrowing a withdrawal costs it.
 *
 * The split with `MediaViewer` is 보관함's: this hook decides **what** is in the track
 * and the component decides **when** a page may land, because only the component can
 * see whether its own scroller has gone still (§ 8.3.).
 *
 * INFO: `toSenderName` rather than a name per row (DESIGN.md § 7.10.). The wire carries `senderId` and the room already holds the participants it resolves against (§ 8.7.); it must be memoized, since every callback below carries its identity.
 */
export function useViewerTrack(toSenderName: (senderId: string) => Optional<string>) {
  const [viewer, setViewer] = useState<Nullable<ViewerTrack>>(null);
  // INFO: State rather than only the ref beside it, because `MediaViewer` holds the page until its track goes still and has to re-render to notice one arriving (§ 8.3.).
  const [hasHeldPage, setHasHeldPage] = useState(false);
  const heldRef = useRef<HeldPages>(toEmptyPages());
  /**
   * Whether either edge may have more of the conversation behind it.
   *
   * WARN: Both start `false` and only the window arms them. Before it lands the track
   * is the bubble's own attachments — nine cells at most (§ 6.) — so the viewer reports
   * the reader as being near both edges, and a page fetched off a cell of a **draft**
   * would be measured from an id no `media` row has yet.
   */
  const hasMoreRef = useRef<Record<ChatTrackEdge, boolean>>({ older: false, newer: false });
  const isLoadingRef = useRef<Record<ChatTrackEdge, boolean>>({ older: false, newer: false });
  /**
   * WARN: REQUIREMENTS.md § 8.6.1.'s generation, for the reason 보관함's upward paging
   * needs one (§ 10.). The reader can close the viewer and open another photo while a
   * page is in flight, and that page is a stretch of a track that no longer exists —
   * committed anyway it would splice an unrelated run of the conversation into the new
   * open and throw the reader across it.
   *
   * INFO: It is also what guards the window swap, in place of the anchor comparison that used to. A fetch outliving a *close* is exactly what a generation answers, and the reader swiping to a sibling of the tapped slide before the window lands is not that case: a bubble's attachments are contiguous in the track and `MAX_MEDIA_PER_MESSAGE` is far inside `CHAT_MEDIA_TRACK_SPAN`, so the slide they moved to is in the window too and `MediaViewer` reconciles onto it by id.
   */
  const generationRef = useRef(0);
  /**
   * REQUIREMENTS.md § 8.13. Every message withdrawn since this viewer opened, which is
   * what a page landing **after** the withdrawal is filtered through.
   *
   * WARN: The generation cannot answer this. A withdrawal is not a reopen: bumping it would discard a page fetched for the track the reader is still holding, and `isLoadingRef` is only cleared for the generation that set it — so the edge that was mid-request would page no further for the rest of the open.
   */
  const droppedRef = useRef(new Set<number>());

  // INFO: Bumped rather than cleared, so anything already in flight for the previous open is discarded when it lands rather than having to be cancelled.
  const reset = useCallback(() => {
    generationRef.current += 1;
    heldRef.current = toEmptyPages();
    hasMoreRef.current = { older: false, newer: false };
    isLoadingRef.current = { older: false, newer: false };
    droppedRef.current = new Set();
    setHasHeldPage(false);
  }, []);

  /**
   * REQUIREMENTS.md § 8.1. Widens the track from the tapped bubble to a window on the
   * whole conversation, and arms paging at whichever edge that window filled.
   *
   * WARN: `hasMoreRef` is read off the window's own shape rather than reported by the server, exactly as 보관함 reads its upward edge (§ 10.): the anchor's distance from each end **is** how many rows came back that way, and a side that filled `CHAT_MEDIA_TRACK_SPAN` is the same "there may be more" test every later page is judged by.
   * WARN: A failure is silent, and deliberately. The bubble's own attachments are already on screen and still swipeable, so the track simply stays as narrow as it used to be — a toast here would report the loss of something the reader never asked for. Paging stays disarmed, which is the honest state: nothing knows where this track sits in the conversation.
   */
  const extend = useCallback(
    async (anchorId: Optional<string>, generation: number) => {
      if (!anchorId) {
        return;
      }

      try {
        const track = await fetchConversationMedia({ around: anchorId });
        const index = track.findIndex((item) => item.id === anchorId);

        if (index < 0 || generation !== generationRef.current) {
          return;
        }

        hasMoreRef.current = {
          older: index >= CHAT_MEDIA_TRACK_SPAN,
          newer: track.length - 1 - index >= CHAT_MEDIA_TRACK_SPAN,
        };

        // WARN: § 8.13. Filtered for the reason a page is: a withdrawal landing while this was in flight has already narrowed the track, and the window replaces it whole — so an unfiltered one puts those slides back and offers 메시지 삭제 over a message that is gone. `hasMoreRef` above stays keyed on what the conversation answered with, since a locally withdrawn row still says the side filled.
        const rows = toSurvivingRows(track, droppedRef.current);
        // WARN: `previous` is still tested, because `drop` can have closed the viewer without bumping the generation — the last slide of a withdrawn bubble leaves nothing to look at (§ 8.13.), and a window landing after that would put the overlay back up over the conversation.
        setViewer((previous) =>
          previous
            ? {
                cells: toCellsFromTrack(rows, toSenderName),
                index: rows.findIndex((row) => row.id === anchorId),
                owners: toTrackOwners(rows),
              }
            : previous,
        );
      } catch {
        // INFO: Reported nowhere on purpose — see above. The narrow track is a working viewer.
      }
    },
    [toSenderName],
  );

  /**
   * REQUIREMENTS.md § 8.1. Opens the viewer on the bubble's own attachments, so the tap
   * costs no round trip, and asks for the conversation-wide window behind it.
   *
   * WARN: The seed cells are given the message and the sender the bubble already knows, rather than waiting for the window to supply them. `toCellsFromMedia` leaves both unset because a bubble's grid has no use for them, but the viewer does: without them the § 7.10. counter reads nothing and the identity block cannot travel, then both appear a moment later when the window lands.
   */
  const open = useCallback(
    (cells: MediaCell[], index: number, messageId: number, senderId: string) => {
      reset();
      setViewer({
        cells: cells.map((cell) => ({
          ...cell,
          messageId,
          senderName: toSenderName(senderId) ?? null,
        })),
        index,
        owners: toBubbleOwners(cells, messageId, senderId),
      });
      void extend(cells[index]?.id, generationRef.current);
    },
    [extend, reset, toSenderName],
  );

  const close = useCallback(() => {
    reset();
    setViewer(null);
  }, [reset]);

  /**
   * REQUIREMENTS.md § 8.1. The stretch of the conversation beyond one edge, fetched
   * here and **held** rather than committed.
   *
   * WARN: Inserting at the older edge moves every slide the reader has behind them, and the scroll correction that answers for it is dropped if it lands mid-gesture (§ 8.3.) — `MediaViewer` owns that timing and calls `commit` once its track has gone still.
   * WARN: The anchor is the slide **at the edge right now**, handed over by the viewer, never a cursor this hook remembers. Nothing else prepends to a chat track — a live arrival does not enter an open one — so the ends of `cells` are always the contiguous boundary, and a withdrawal that takes the edge slide out moves the anchor to the next surviving one for free (`drop`).
   */
  const loadEdge = useCallback(async (edge: ChatTrackEdge, anchorId: string) => {
    if (
      !hasMoreRef.current[edge] ||
      isLoadingRef.current[edge] ||
      heldRef.current[edge].length > 0
    ) {
      return;
    }

    const generation = generationRef.current;

    isLoadingRef.current[edge] = true;

    try {
      const page = await fetchConversationMedia(
        edge === "older" ? { before: anchorId } : { after: anchorId },
      );

      // WARN: Before the two writes below, not after. `hasMoreRef` left written by a superseded page reports an edge that belongs to a track that is gone; discarded whole, the next ask re-fetches the same rows off an unmoved edge and nothing is lost.
      if (generation !== generationRef.current) {
        return;
      }

      // INFO: A page that did not fill is the end of the conversation in that direction, which is the only place the track still simply ends.
      hasMoreRef.current[edge] = page.length >= CHAT_MEDIA_TRACK_SPAN;

      // WARN: § 8.13. Filtered before it is held, because this request can have been issued before a withdrawal and answered after it — `drop` filters what is already held and cannot reach a page that is still in flight. Committed unexamined, those slides arrive back into the track and offer 메시지 삭제 over a message that is gone.
      const rows = toSurvivingRows(page, droppedRef.current);

      heldRef.current[edge] = rows;

      if (rows.length > 0) {
        setHasHeldPage(true);
      }
    } catch {
      // INFO: Silent for the reason `extend` is. The loaded track is a working viewer, and the next crossing asks again.
    } finally {
      // WARN: Guarded, or a page from a superseded open clears a flag the *current* open set and lets a second request for the same edge go out behind the first.
      if (generation === generationRef.current) {
        isLoadingRef.current[edge] = false;
      }
    }
  }, []);

  /**
   * REQUIREMENTS.md § 8.1. Commits whatever is held. Called by `MediaViewer` on every
   * settle rather than only the awaited ones (§ 8.3.), hence the early return.
   *
   * WARN: `index` is deliberately left where it stood, and it is the one field a prepend must not touch — advancing it by the page's length looks right and is wrong. It is `MediaViewer`'s `initialIndex`, the offset the viewer **opened** at, read once at mount and never again; the reader's real position is the held slide's id, which the viewer derives during render and which a prepend moves on its own. Written to, it would be neither number.
   * INFO: Deduplicated for the reason 보관함's pages are. Nothing produces a repeat today — the anchor is excluded by the query and only paging inserts here — but a duplicate id would duplicate a React key in the track and snap a swipe back onto the first copy (`listConversationMedia`).
   */
  const commit = useCallback(() => {
    const held = heldRef.current;

    if (held.older.length === 0 && held.newer.length === 0) {
      return;
    }

    heldRef.current = toEmptyPages();
    setHasHeldPage(false);
    setViewer((previous) => {
      if (!previous) {
        return previous;
      }

      const known = new Set(previous.cells.map((cell) => cell.id));
      const older = held.older.filter((row) => !known.has(row.id));
      const newer = held.newer.filter((row) => !known.has(row.id));

      return {
        ...previous,
        cells: [
          ...toCellsFromTrack(older, toSenderName),
          ...previous.cells,
          ...toCellsFromTrack(newer, toSenderName),
        ],
        owners: new Map([...previous.owners, ...toTrackOwners(older), ...toTrackOwners(newer)]),
      };
    });
  }, [toSenderName]);

  /**
   * REQUIREMENTS.md § 8.1., § 8.13. Takes a withdrawn message's slides out of the
   * track.
   *
   * WARN: Not a dismissal any more, which is what this was while the track was one
   * bubble. The track now spans the conversation, so a withdrawal elsewhere in it
   * must not close a viewer the reader is using — it removes those slides and leaves
   * the reader on the next photo, exactly as 보관함's own 삭제 does (`DESIGN.md § 7.10.`).
   * The viewer closes only when the withdrawal took the last slide with it.
   *
   * WARN: The **held pages are filtered too**, not only the loaded track. A page waiting for the track to go still can carry slides of the very message being withdrawn, and § 8.13. is that those slides leave — committed unexamined they arrive back into the track a moment later, offering 메시지 삭제 over a message that is already gone.
   * WARN: And the id is remembered, because filtering what is held reaches neither the page nor the window still **in flight** — `droppedRef` is what those two are filtered through when they land.
   */
  const drop = useCallback((messageId: number) => {
    droppedRef.current.add(messageId);

    const held: HeldPages = {
      older: toSurvivingRows(heldRef.current.older, droppedRef.current),
      newer: toSurvivingRows(heldRef.current.newer, droppedRef.current),
    };

    heldRef.current = held;
    setHasHeldPage(held.older.length + held.newer.length > 0);
    setViewer((previous) => {
      if (!previous) {
        return previous;
      }

      const cells = previous.cells.filter(
        (cell) => previous.owners.get(cell.id)?.messageId !== messageId,
      );

      if (cells.length === previous.cells.length) {
        return previous;
      }

      // INFO: § 8.1. `index` is left exactly where it stood rather than clamped to the shorter track: it is `MediaViewer`'s `initialIndex`, read once at mount and never again, and the reader's position is the held slide's id — which the viewer re-points onto the surviving neighbour itself.
      return cells.length === 0 ? null : { ...previous, cells };
    });
  }, []);

  // INFO: Assembled here rather than at the JSX, so `MediaViewer`'s requirement that both callbacks be memoized is met where they are written rather than remembered at the call site.
  const paging = useMemo(
    () => ({ hasHeldPage, onLoadEdge: loadEdge, onCommit: commit }),
    [hasHeldPage, loadEdge, commit],
  );

  return { viewer, paging, open, close, drop };
}

// INFO: A factory rather than a shared constant, because the two arrays are replaced wholesale and a shared literal would be one object every reset points back at.
function toEmptyPages(): HeldPages {
  return { older: [], newer: [] };
}

// INFO: REQUIREMENTS.md § 8.13. Named rather than written out at each of the three sites, so the window, a page in flight and a page already held cannot come to disagree about what a withdrawal removed.
function toSurvivingRows(rows: ChatTrackMedia[], dropped: Set<number>): ChatTrackMedia[] {
  return rows.filter((row) => !dropped.has(row.messageId));
}
