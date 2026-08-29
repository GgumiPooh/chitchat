"use client";

import type { EventOccurrence } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { EVENT_COLOR_FILL_CLASSES, EVENT_FALLBACK_FILL_CLASS } from "@/shared/config";
import {
  cn,
  formatDateWithWeekday,
  formatMultiDaySpan,
  formatOccurrenceTime,
  parseDayKey,
  toDayKey,
  type Nullable,
} from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { ActionSheet, Avatar, IconButton, Modal, toast } from "@/shared/ui";
import { Settings2 } from "lucide-react";
import { useRef, useState, type PropsWithChildren } from "react";
import { deleteEvent } from "../api/write-event";
import { EventFormSheet } from "./event-form-sheet";

export type EventDetailDialogProps = {
  className?: string;
  /** The occurrence on show; `null` closes the dialog. */
  occurrence: Nullable<EventOccurrence>;
  /** REQUIREMENTS.md § 11.4. For the authorship line — a record, never a permission check. */
  participants: Participant[];
  /** REQUIREMENTS.md § 16.2. The mirror reads an event in full and offers nothing on it — no 일정 관리, so no 수정 and no 삭제. */
  isReadOnly?: boolean;
  onClose: () => void;
  /** A save or a delete landed; the screen refetches. */
  onChanged: () => void;
};

/**
 * REQUIREMENTS.md § 11.4. What a tap on an event row opens — the whole event, memo
 * included, where the list clamps it to two lines.
 *
 * INFO: It owns 수정 and 삭제 as well as the reading, so 캘린더 and 채팅's § 11.5.1.
 * panel both get the full flow from one component rather than a copy each.
 *
 * WARN: The three surfaces are shown **one at a time**, never stacked. All three are
 * modal and portalled to `body` and none is declared nested, so two of them up at once
 * is two focus traps — and dismissing the top one can leave the one underneath inert.
 */
export function EventDetailDialog({
  className,
  occurrence,
  participants,
  isReadOnly = false,
  onClose,
  onChanged,
}: EventDetailDialogProps) {
  // WARN: The occurrence outlives its own closing. Radix keeps the content mounted for the exit animation, so reading `occurrence` — already null by then — empties the body mid-flight and the box collapses to its header before it fades. Everything drawn reads `shown`; only `isOpen` reads the prop.
  const [shown, setShown] = useState(occurrence);

  if (occurrence !== null && occurrence !== shown) {
    setShown(occurrence);
  }

  const [isManaging, setIsManaging] = useState(false);
  // INFO: Bumped per opening, because `EventFormSheet` seeds its draft once — at mount.
  const [formToken, setFormToken] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const deleteGate = useOfflineGate(OFFLINE_MESSAGES.remove);
  const author = participants.find(({ id }) => id === shown?.event.createdBy);
  // INFO: AGENTS.md § 4.1. `ActionSheet`'s desktop anchor for 일정 관리.
  const manageButtonRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Modal
        className={className}
        isOpen={occurrence !== null && !isManaging && !isEditing}
        size="md"
        header={{
          // WARN: The title clears both corner controls, or a long event name runs under them.
          // INFO: `break-all` — the app wraps on spaces (DESIGN.md § 4.2.3.), which leaves a long spaceless title overflowing its own line rather than wrapping.
          className: "pr-24 break-all",
          title: shown?.event.title ?? "일정",
          action: isReadOnly ? undefined : (
            <IconButton
              ref={manageButtonRef}
              Icon={Settings2}
              haptic
              aria-label="일정 관리"
              onClick={() => setIsManaging(true)}
            />
          ),
        }}
        onClose={onClose}
      >
        {shown && (
          <dl className="space-y-sm">
            <Row label="언제">
              <span className="block text-body-md text-ink">
                {formatMultiDaySpan(shown) ??
                  formatDateWithWeekday(parseDayKey(toDayKey(shown.startsAt)))}
              </span>
              <span className="block text-caption text-meta">
                {formatOccurrenceTime(shown, toDayKey(shown.startsAt))}
              </span>
            </Row>
            <Row label="구분">
              <span className="flex items-center gap-2xs text-body-md text-ink">
                {/* INFO: A swatch and not `EventDot` — a feature may not reach a widget (REQUIREMENTS.md § 2.), and the grid's 4px shape carries scope where this row spells it out in a word. */}
                <span
                  className={cn(
                    "size-2 rounded-full",
                    shown.event.color
                      ? EVENT_COLOR_FILL_CLASSES[shown.event.color]
                      : EVENT_FALLBACK_FILL_CLASS,
                  )}
                />
                {/* INFO: REQUIREMENTS.md § 11.5. `개인` and never `내` — both users read this row, so `내` is wrong for whichever of them did not write it. */}
                {shown.event.scope === "mine" ? "개인 일정" : "우리 일정"}
                {shown.event.recurrence === "yearly" && " · 매년"}
              </span>
            </Row>
            {author && (
              <Row label="추가한 사람">
                <span className="flex items-center gap-2xs text-body-md text-ink">
                  <Avatar className="size-6" name={author.name} mediaId={author.avatarMediaId} />
                  {author.name}
                </span>
              </Row>
            )}
            {shown.event.description?.trim() && (
              <Row label="메모">
                {/* INFO: In full and never clamped — this dialog is what the list's two-line clamp leads to. */}
                <span className="block text-body-md wrap-anywhere [word-break:normal] whitespace-pre-line text-ink">
                  {shown.event.description.trim()}
                </span>
              </Row>
            )}
          </dl>
        )}
      </Modal>

      {/* INFO: REQUIREMENTS.md § 11.4. No permission tier — 수정 and 삭제 are offered on every event, whoever created it. */}
      <ActionSheet
        isOpen={isManaging}
        anchorRef={manageButtonRef}
        header={{ title: shown?.event.title ?? "일정", isHidden: true }}
        items={[
          { label: "수정", onSelect: edit },
          {
            label: "삭제",
            variant: "destructive",
            onSelect: deleteGate.guard(() => void remove()),
          },
        ]}
        onClose={() => setIsManaging(false)}
      />

      {/* WARN: Mounted whenever there is something to edit, not only while editing — the sheet stays up through its slide-down, which unmounting would cut short. */}
      {shown && (
        <EventFormSheet
          key={formToken}
          isOpen={isEditing}
          dayKey={toDayKey(shown.startsAt)}
          occurrence={shown}
          onClose={() => setIsEditing(false)}
          onSaved={saved}
        />
      )}
    </>
  );

  function edit() {
    setIsManaging(false);
    setFormToken((token) => token + 1);
    setIsEditing(true);
  }

  // WARN: The dialog closes rather than reopening on what was just saved. Its `occurrence` is the screen's, and the refetch `onChanged` starts has not landed — reopening shows the row's old values under a sheet that has just written new ones.
  function saved() {
    setIsEditing(false);
    onClose();
    onChanged();
  }

  async function remove() {
    if (!shown) {
      return;
    }

    setIsManaging(false);

    try {
      await deleteEvent(shown.event.id);
      onClose();
      onChanged();
    } catch {
      toast.error("일정을 삭제하지 못했어요");
    }
  }
}

type RowProps = PropsWithChildren<{
  className?: string;
  label: string;
}>;

function Row({ className, label, children }: RowProps) {
  return (
    <div className={cn("space-y-2xs", className)}>
      <dt className="text-caption text-meta">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
