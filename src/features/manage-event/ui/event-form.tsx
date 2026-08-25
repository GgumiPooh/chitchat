"use client";

import { MAX_EVENT_DESCRIPTION_LENGTH, MAX_EVENT_TITLE_LENGTH } from "@/shared/config";
import { cn, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import { Button, Chip, Input, Switch, Textarea } from "@/shared/ui";
import type { PropsWithChildren } from "react";
import type { EventDraft } from "../model/event-draft";
import { isDraftSubmittable } from "../model/event-draft";
import { EventColorPicker } from "./event-color-picker";

export type EventFormProps = {
  className?: string;
  draft: EventDraft;
  issue: Nullable<string>;
  isBlocked: boolean;
  isSubmitting: boolean;
  isEditing: boolean;
  onUpdate: (patch: Partial<EventDraft>) => void;
  onStartDayKeyChange: (dayKey: string) => void;
  onSubmit: () => void;
};

/**
 * REQUIREMENTS.md § 11.4. The fields shared by `EventFormSheet`'s two
 * presentations — the sheet and the desktop calendar's inline card.
 */
export function EventForm({
  className,
  draft,
  issue,
  isBlocked,
  isSubmitting,
  isEditing,
  onUpdate,
  onStartDayKeyChange,
  onSubmit,
}: EventFormProps) {
  return (
    <div className={cn("space-y-md", className)}>
      <Input
        value={draft.title}
        maxLength={MAX_EVENT_TITLE_LENGTH}
        placeholder="일정 이름"
        onChange={(event) => onUpdate({ title: event.target.value })}
      />

      <Field label="하루 종일">
        <Switch
          checked={draft.allDay}
          haptic
          aria-label="하루 종일"
          onCheckedChange={(allDay) => onUpdate({ allDay })}
        />
      </Field>

      <div className="space-y-xs">
        <Label>시작</Label>
        <DateTimeRow
          dayKey={draft.startDayKey}
          time={draft.startTime}
          isTimeHidden={draft.allDay}
          onDayKeyChange={onStartDayKeyChange}
          onTimeChange={(startTime) => onUpdate({ startTime })}
        />
      </div>

      <div className="space-y-xs">
        <Label>종료</Label>
        <DateTimeRow
          dayKey={draft.endDayKey}
          time={draft.endTime}
          isTimeHidden={draft.allDay}
          onDayKeyChange={(endDayKey) => onUpdate({ endDayKey })}
          onTimeChange={(endTime) => onUpdate({ endTime })}
        />
      </div>

      <div className="space-y-xs">
        <Label>구분</Label>
        {/* INFO: REQUIREMENTS.md § 11.5. A distinction, not a privacy control — a `mine` event stays fully visible to the other person, title included (§ 18. #9). */}
        <div className="flex gap-xs">
          <Chip
            haptic
            isSelected={draft.scope === "shared"}
            onClick={() => onUpdate({ scope: "shared" })}
          >
            우리 일정
          </Chip>
          <Chip
            haptic
            isSelected={draft.scope === "mine"}
            onClick={() => onUpdate({ scope: "mine" })}
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
            onClick={() => onUpdate({ recurrence: "none" })}
          >
            반복 없음
          </Chip>
          <Chip
            haptic
            isSelected={draft.recurrence === "yearly"}
            onClick={() => onUpdate({ recurrence: "yearly" })}
          >
            매년
          </Chip>
        </div>
      </div>

      <div className="space-y-xs">
        <Label>색상</Label>
        <EventColorPicker value={draft.color} onChange={(color) => onUpdate({ color })} />
      </div>

      <Textarea
        className="min-h-24"
        value={draft.description}
        maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
        placeholder="메모 (선택)"
        onChange={(event) => onUpdate({ description: event.target.value })}
      />

      <div className="space-y-xs">
        {/* INFO: DESIGN.md § 8.1. A disabled button that will not say why is the form's worst moment — the two states a filled-in draft can be stuck in are named here rather than left to be guessed at. */}
        {issue && (
          <p className="text-body-sm text-semantic-error" role="alert">
            {issue}
          </p>
        )}
        {!issue && isBlocked && (
          <p className="text-body-sm text-meta" role="status">
            {OFFLINE_MESSAGES.save}
          </p>
        )}
        {/* WARN: Left enabled on purpose, where a nav row would go `aria-disabled`. A dimmed 저장 under a draft the reader has just filled in is the form's worst moment twice over. */}
        <Button disabled={!isDraftSubmittable(draft) || isSubmitting} haptic onClick={onSubmit}>
          {isEditing ? "저장" : "추가"}
        </Button>
      </div>
    </div>
  );
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
        // WARN: `min-w-0` — a native `date` input's intrinsic width is wider than the space left beside the time field on a narrow screen, and `flex-1` alone refuses to shrink past it.
        className={cn("min-w-0", isTimeHidden ? "w-full" : "flex-1")}
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
