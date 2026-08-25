"use client";

import type { CalendarEvent, EventOccurrence } from "@/entities/event";
import { type Maybe } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { BottomSheet, toast } from "@/shared/ui";
import { useState } from "react";
import { createEvent, updateEvent } from "../api/write-event";
import {
  toDraftIssue,
  toEditDraft,
  toEventBody,
  toNewDraft,
  type EventDraft,
} from "../model/event-draft";
import { EventForm } from "./event-form";

export type EventFormSheetProps = {
  className?: string;
  isOpen: boolean;
  /** The day a new event is anchored on; ignored while editing. */
  dayKey: string;
  /** Absent for a create, the occurrence being edited otherwise. */
  occurrence: Maybe<EventOccurrence>;
  onClose: () => void;
  onSaved: (event: CalendarEvent) => void;
};

/**
 * REQUIREMENTS.md § 11.4. Create and edit are one form — the fields are identical.
 *
 * WARN: The draft is seeded once, at mount. The caller therefore gives this a
 * `key` that changes per opening; without one the sheet reopens holding whatever
 * the previous event left in it, and a background refetch of the occurrence would
 * be free to overwrite what is being typed.
 *
 * WARN: Which is also the only place the clock may be read. `toNewDraft` seeds a
 * new event from the current time, and the same read in the component body would
 * re-run on every keystroke and move the default under whoever is typing.
 */
export function EventFormSheet({
  className,
  isOpen,
  dayKey,
  occurrence,
  onClose,
  onSaved,
}: EventFormSheetProps) {
  const [draft, setDraft] = useState<EventDraft>(() =>
    occurrence ? toEditDraft(occurrence) : toNewDraft(dayKey, Date.now()),
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const issue = toDraftIssue(draft);
  const { isBlocked, guard } = useOfflineGate(OFFLINE_MESSAGES.save);
  const title = occurrence ? "일정 수정" : "새 일정";

  const fields = (
    <EventForm
      draft={draft}
      issue={issue}
      isBlocked={isBlocked}
      isSubmitting={isSubmitting}
      isEditing={!!occurrence}
      onUpdate={update}
      onStartDayKeyChange={handleStartDayKeyChange}
      onSubmit={guard(() => void submit())}
    />
  );

  return (
    <BottomSheet className={className} isOpen={isOpen} header={{ title }} onClose={onClose}>
      <div className="pt-2xs">{fields}</div>
    </BottomSheet>
  );

  function update(patch: Partial<EventDraft>) {
    setDraft((previous) => ({ ...previous, ...patch }));
  }

  // INFO: The end follows the start while the two are the same day, which is the case every new event begins in — otherwise picking a start silently leaves an event ending before it starts.
  function handleStartDayKeyChange(startDayKey: string) {
    setDraft((previous) => ({
      ...previous,
      startDayKey,
      endDayKey: previous.endDayKey < startDayKey ? startDayKey : previous.endDayKey,
    }));
  }

  async function submit() {
    const body = toEventBody(draft);

    // INFO: Already what disables the button; re-checked because that is what narrows the nullable body, and a cleared date field is the shape that produces one.
    if (!body) {
      return;
    }

    setIsSubmitting(true);

    try {
      onSaved(occurrence ? await updateEvent(occurrence.event.id, body) : await createEvent(body));
      onClose();
    } catch (error) {
      // INFO: The other participant deleting the event while this sheet was open is the one failure worth naming — everything else is the same "try again".
      toast.error(
        error instanceof Error && error.message === "404"
          ? "이미 삭제된 일정이에요"
          : "일정을 저장하지 못했어요",
      );
    } finally {
      setIsSubmitting(false);
    }
  }
}
