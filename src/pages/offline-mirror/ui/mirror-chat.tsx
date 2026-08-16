"use client";

import type { ChatSnapshot, ShellSnapshot } from "@/features/offline-snapshot";
import type { InlineEmoticonMap } from "@/shared/config";
import { composeEventNotice, type UserId } from "@/shared/lib";
import { useSnapshot } from "@/shared/snapshot";
import { AppHeader, Container } from "@/shared/ui";
import { SnapshotEmpty, SnapshotStamp } from "@/widgets/offline-shell";
import { MessageCircle } from "lucide-react";
import { useEffect, useMemo } from "react";
import { buildMirrorRows, formatMirrorDayLabel, type MirrorRow } from "../model/build-mirror-rows";
import { MirrorChatRow } from "./mirror-chat-row";
import { MirrorLoading } from "./mirror-loading";

export type MirrorChatProps = {
  className?: string;
  shell: ShellSnapshot;
};

// WARN: Hoisted so a snapshot without one passes the same identity to every row, rather than a fresh object per render.
const NO_EMOTICONS: InlineEmoticonMap = {};

/**
 * 채팅 as it was last received (REQUIREMENTS.md § 16.).
 *
 * INFO: The document scrolls this, where the live room is a `fixed` box of its own
 * (AGENTS.md § 4.4.) — that box exists for the composer's keyboard, and a read-only
 * mirror raises no keyboard.
 */
export function MirrorChat({ className, shell }: MirrorChatProps) {
  const snapshot = useSnapshot<ChatSnapshot>("chat");
  const messages = snapshot.status === "hit" ? snapshot.payload.messages : undefined;
  // INFO: REQUIREMENTS.md § 13. Absent from every snapshot an earlier build wrote, which reads as a transcript whose emoticons have no names — exactly what this screen did before the map was stored.
  const emoticons = snapshot.payload?.emoticons ?? NO_EMOTICONS;
  const participantById = useMemo(
    () => new Map(shell.participants.map((participant) => [participant.id, participant])),
    [shell.participants],
  );
  const rows = useMemo(
    () => (messages ? buildMirrorRows(messages, shell.currentUserId) : []),
    [messages, shell.currentUserId],
  );

  // INFO: DESIGN.md § 6.7. The newest message is what the room opens on, and the mirror is read from the same end.
  useEffect(() => {
    if (rows.length > 0) {
      window.scrollTo(0, document.body.scrollHeight);
    }
  }, [rows.length]);

  return (
    <div className={className}>
      {/* INFO: DESIGN.md § 7.12. No title, exactly as the live room has none — the tab bar already says which screen this is. */}
      <AppHeader />
      <Container className="flex flex-col px-0 pt-[calc(var(--app-header-inset)+var(--spacing-xs))] pb-[var(--bottom-inset,0px)]">
        {snapshot.status === "loading" && <MirrorLoading />}
        {snapshot.status === "miss" && <SnapshotEmpty Icon={MessageCircle} subject="메시지" />}
        {rows.map(renderRow)}
        {snapshot.status === "hit" && (
          <SnapshotStamp className="py-md text-center" savedAt={snapshot.savedAt} />
        )}
      </Container>
    </div>
  );

  function renderRow(row: MirrorRow) {
    if (row.kind === "date") {
      return (
        <div key={row.key} className="flex justify-center py-md">
          <span className="rounded-full bg-chat-pill px-sm py-2xs text-caption text-chat-pill-ink">
            {formatMirrorDayLabel(row.dayKey)}
          </span>
        </div>
      );
    }

    if (row.kind === "system") {
      return (
        // INFO: DESIGN.md § 6.5. The divider's own treatment, without the calendar link the live notice carries — the day it would open is not the day this snapshot holds.
        <div key={row.key} className="flex justify-center px-md py-sm">
          <span className="min-w-0 rounded-full bg-chat-pill px-sm py-2xs text-center text-caption text-chat-pill-ink">
            {composeEventNotice(
              row.message.systemAction,
              row.message.eventTitle,
              row.message.eventStartsAt,
              toName(row.message.senderId),
            )}
          </span>
        </div>
      );
    }

    return (
      <MirrorChatRow
        key={row.key}
        message={row.message}
        inlineEmoticons={emoticons}
        sender={participantById.get(row.message.senderId)}
        replyToName={row.message.replyTo ? toName(row.message.replyTo.senderId) : undefined}
        isMine={row.isMine}
        isFirstOfGroup={row.isFirstOfGroup}
        isLastOfGroup={row.isLastOfGroup}
      />
    );
  }

  function toName(userId: UserId) {
    return participantById.get(userId)?.name;
  }
}
