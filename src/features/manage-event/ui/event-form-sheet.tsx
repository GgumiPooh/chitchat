"use client";

import type { CalendarEvent, EventOccurrence } from "@/entities/event";
import { MAX_EVENT_DESCRIPTION_LENGTH, MAX_EVENT_TITLE_LENGTH } from "@/shared/config";
import { cn, type Maybe } from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import { BottomSheet, Button, Chip, Input, Switch, Textarea, toast } from "@/shared/ui";
import { useState, type PropsWithChildren } from "react";
import { createEvent, updateEvent } from "../api/write-event";
import {
  isDraftSubmittable,
  toDraftIssue,
  toEditDraft,
  toEventBody,
  toNewDraft,
  type EventDraft,
} from "../model/event-draft";
import { EventColorPicker } from "./event-color-picker";

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

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{ title: occurrence ? "일정 수정" : "새 일정" }}
      onClose={onClose}
    >
      <div className="space-y-md pt-2xs">
        <Input
          value={draft.title}
          maxLength={MAX_EVENT_TITLE_LENGTH}
          placeholder="일정 이름"
          onChange={(event) => update({ title: event.target.value })}
        />

        <Field label="하루 종일">
          <Switch
            checked={draft.allDay}
            haptic
            aria-label="하루 종일"
            onCheckedChange={(allDay) => update({ allDay })}
          />
        </Field>

        <div className="space-y-xs">
          <Label>시작</Label>
          <DateTimeRow
            dayKey={draft.startDayKey}
            time={draft.startTime}
            isTimeHidden={draft.allDay}
            onDayKeyChange={handleStartDayKeyChange}
            onTimeChange={(startTime) => update({ startTime })}
          />
        </div>

        <div className="space-y-xs">
          <Label>종료</Label>
          <DateTimeRow
            dayKey={draft.endDayKey}
            time={draft.endTime}
            isTimeHidden={draft.allDay}
            onDayKeyChange={(endDayKey) => update({ endDayKey })}
            onTimeChange={(endTime) => update({ endTime })}
          />
        </div>

        <div className="space-y-xs">
          <Label>구분</Label>
          {/* INFO: REQUIREMENTS.md § 11.5. A distinction, not a privacy control — a `mine` event stays fully visible to the other person, title included (§ 18. #9). */}
          <div className="flex gap-xs">
            <Chip
              haptic
              isSelected={draft.scope === "shared"}
              onClick={() => update({ scope: "shared" })}
            >
              우리 일정
            </Chip>
            <Chip
              haptic
              isSelected={draft.scope === "mine"}
              onClick={() => update({ scope: "mine" })}
            >
              내 일정
            </Chip>
          </div>
        </div>

        <div className="space-y-xs">
          <Label>반복</Label>
          {/* INFO: REQUIREMENTS.md § 6. Yearly is the only recurrence there will ever be — it exists for anniversaries, not as a rule engine. */}
          <div className="flex gap-xs">
            <Chip
              haptic
              isSelected={draft.recurrence === "none"}
              onClick={() => update({ recurrence: "none" })}
            >
              반복 없음
            </Chip>
            <Chip
              haptic
              isSelected={draft.recurrence === "yearly"}
              onClick={() => update({ recurrence: "yearly" })}
            >
              매년
            </Chip>
          </div>
        </div>

        <div className="space-y-xs">
          <Label>색상</Label>
          <EventColorPicker value={draft.color} onChange={(color) => update({ color })} />
        </div>

        <Textarea
          className="min-h-24"
          value={draft.description}
          maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
          placeholder="메모 (선택)"
          onChange={(event) => update({ description: event.target.value })}
        />

        <div className="space-y-xs">
          {/* INFO: DESIGN.md § 8.1. A disabled button that will not say why is the form's worst moment — the two states a filled-in draft can be stuck in are named here rather than left to be guessed at. */}
          {issue && (
            <p className="text-body-sm text-semantic-error" role="alert">
              {issue}
            </p>
          )}
          {/* INFO: `meta` rather than the line above's `semantic-error` — the draft is fine and nothing about it has to change, which is the opposite of what an error asks for. */}
          {!issue && isBlocked && (
            <p className="text-body-sm text-meta" role="status">
              {OFFLINE_MESSAGES.save}
            </p>
          )}
          {/* WARN: Left enabled on purpose, where a nav row would go `aria-disabled`. A dimmed 저장 under a draft the reader has just filled in is the form's worst moment twice over, and the sheet stays open on the refusal so nothing typed is lost. */}
          <Button
            disabled={!isDraftSubmittable(draft) || isSubmitting}
            haptic
            onClick={guard(() => void submit())}
          >
            {occurrence ? "저장" : "추가"}
          </Button>
        </div>
      </div>
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

type LabelProps = PropsWithChildren<{
  className?: string;
}>;

function Label({ className, children }: LabelProps) {
  return <p className={cn("text-caption text-meta", className)}>{children}</p>;
}

type FieldProps = PropsWithChildren<{
  className?: string;
  label: string;
}>;

function Field({ className, label, children }: FieldProps) {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <p className="text-body-md text-body">{label}</p>
      {children}
    </div>
  );
}

type DateTimeRowProps = {
  className?: string;
  dayKey: string;
  time: string;
  isTimeHidden: boolean;
  onDayKeyChange: (dayKey: string) => void;
  onTimeChange: (time: string) => void;
};

function DateTimeRow({
  className,
  dayKey,
  time,
  isTimeHidden,
  onDayKeyChange,
  onTimeChange,
}: DateTimeRowProps) {
  return (
    <div className={cn("flex gap-xs", className)}>
      {/* WARN: Native `date` / `time` inputs, deliberately — iOS renders its own wheel picker for them, and a custom control would be a worse version of it that also has to reimplement the keyboard case. */}
      <Input
        className={cn(isTimeHidden ? "w-full" : "flex-1")}
        type="date"
        value={dayKey}
        onChange={(event) => onDayKeyChange(event.target.value)}
      />
      {!isTimeHidden && (
        <Input
          className="w-32"
          type="time"
          value={time}
          onChange={(event) => onTimeChange(event.target.value)}
        />
      )}
    </div>
  );
}
