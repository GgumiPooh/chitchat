"use client";

import type { GoogleCalendarSource } from "@/entities/google-calendar";
import {
  EVENT_RECURRENCE_LABELS,
  MAX_EVENT_DESCRIPTION_LENGTH,
  MAX_EVENT_TITLE_LENGTH,
  SELECTABLE_EVENT_RECURRENCES,
} from "@/shared/config";
import { cn, useRovingTabIndex, type Nullable } from "@/shared/lib";
import { OFFLINE_MESSAGES } from "@/shared/offline-ux";
import { Button, Chip, Input, SettingsRow, Switch, Textarea } from "@/shared/ui";
import { Bell, BellOff } from "lucide-react";
import { useState, type PropsWithChildren } from "react";
import type { EventDraft } from "../model/event-draft";
import { isDraftSubmittable } from "../model/event-draft";
import { EventColorPicker } from "./event-color-picker";

const REMINDER_HINTS = {
  mine: "나만 알림을 받아요",
  off: "이 일정은 알림 없이 조용히 지나가요",
  shared: "두 분 모두 알림을 받아요",
} as const;

export type EventFormProps = {
  className?: string;
  draft: EventDraft;
  isBlocked: boolean;
  isEditing: boolean;
  isSubmitting: boolean;
  issue: Nullable<string>;
  selectedCalendarId?: Nullable<string>;
  writableCalendars?: readonly GoogleCalendarSource[];
  onStartDayKeyChange: (dayKey: string) => void;
  onSubmit: () => void;
  onUpdate: (patch: Partial<EventDraft>) => void;
};

/**
 * REQUIREMENTS.md § 11.4. The fields shared by `EventFormSheet`'s two
 * presentations — the sheet and the desktop calendar's inline card.
 */
export function EventForm({
  className,
  draft,
  isBlocked,
  isEditing,
  isSubmitting,
  issue,
  selectedCalendarId,
  writableCalendars,
  onStartDayKeyChange,
  onSubmit,
  onUpdate,
}: EventFormProps) {
  const [hadCustomRecurrence] = useState(() => draft.recurrence === "custom");
  const handleRadioKeyDown = useRovingTabIndex({
    orientation: "horizontal",
    selector: "[role='radio']",
  });

  const recurrenceOptions =
    hadCustomRecurrence || draft.recurrence === "custom"
      ? [...SELECTABLE_EVENT_RECURRENCES, "custom" as const]
      : SELECTABLE_EVENT_RECURRENCES;
  const selectedRecurrenceIndex = Math.max(
    0,
    recurrenceOptions.findIndex((r) => r === draft.recurrence),
  );

  const scopeOptions = ["shared", "mine"] as const;
  const selectedScopeIndex = Math.max(
    0,
    scopeOptions.findIndex((s) => s === draft.scope),
  );

  const effectiveTargetCalendarId = draft.targetCalendarId ?? selectedCalendarId;
  const selectedCalendarIndex = Math.max(
    0,
    writableCalendars
      ? writableCalendars.findIndex((c) => c.calendarId === effectiveTargetCalendarId)
      : 0,
  );

  return (
    <div className={cn("space-y-lg", className)}>
      <div className="space-y-md">
        <div className="space-y-xs">
          <Label>일정 이름</Label>
          <Input
            maxLength={MAX_EVENT_TITLE_LENGTH}
            placeholder="일정 이름"
            value={draft.title}
            aria-label="일정 이름"
            onChange={(event) => onUpdate({ title: event.target.value })}
          />
        </div>

        <div className="space-y-xs">
          <Label>색상</Label>
          <EventColorPicker value={draft.color} onChange={(color) => onUpdate({ color })} />
        </div>
      </div>

      <hr className="border-hairline-soft" />

      <div className="space-y-md">
        <div className="space-y-xs">
          <Label>하루 종일</Label>
          <Switch
            checked={draft.allDay}
            haptic
            aria-label="하루 종일"
            onCheckedChange={(allDay) => onUpdate({ allDay })}
          />
        </div>

        <div className="space-y-xs">
          <Label>시작</Label>
          <DateTimeRow
            dateAriaLabel="시작 날짜"
            dayKey={draft.startDayKey}
            isTimeHidden={draft.allDay}
            time={draft.startTime}
            timeAriaLabel="시작 시간"
            onDayKeyChange={onStartDayKeyChange}
            onTimeChange={(startTime) => onUpdate({ startTime })}
          />
        </div>

        <div className="space-y-xs">
          <Label>종료</Label>
          <DateTimeRow
            dateAriaLabel="종료 날짜"
            dayKey={draft.endDayKey}
            isTimeHidden={draft.allDay}
            time={draft.endTime}
            timeAriaLabel="종료 시간"
            onDayKeyChange={(endDayKey) => onUpdate({ endDayKey })}
            onTimeChange={(endTime) => onUpdate({ endTime })}
          />
        </div>

        <div className="space-y-xs">
          <Label>반복</Label>
          {/* INFO: REQUIREMENTS.md § 6. Fixed cadences plus custom RRULE from Google Calendar. */}
          <div
            className="flex flex-wrap gap-xs"
            role="radiogroup"
            aria-label="반복"
            onKeyDown={handleRadioKeyDown}
          >
            {recurrenceOptions.map((recurrence, index) => {
              const isSelected = draft.recurrence === recurrence;
              return (
                <Chip
                  key={recurrence}
                  role="radio"
                  haptic
                  isSelected={isSelected}
                  tabIndex={index === selectedRecurrenceIndex ? 0 : -1}
                  aria-checked={isSelected}
                  onClick={() => onUpdate({ recurrence })}
                >
                  {EVENT_RECURRENCE_LABELS[recurrence]}
                </Chip>
              );
            })}
          </div>
          {hadCustomRecurrence && (
            <p className="text-caption text-meta">
              {draft.recurrence === "custom"
                ? "Google 캘린더에서 설정된 맞춤 반복 일정이에요"
                : "저장하면 기존 맞춤 반복 규칙이 선택한 주기로 바뀌어요"}
            </p>
          )}
        </div>

        {draft.recurrence !== "none" && draft.recurrence !== "custom" && (
          <div className="space-y-xs">
            <Label>반복 종료일 (선택)</Label>
            <div className="flex items-center gap-xs">
              <Input
                className="min-w-0 flex-1"
                min={draft.startDayKey}
                type="date"
                value={draft.recurrenceUntil}
                aria-label="반복 종료일"
                onChange={(event) => onUpdate({ recurrenceUntil: event.target.value })}
              />
              {draft.recurrenceUntil && (
                <Chip
                  haptic
                  aria-label="반복 종료일 삭제하고 계속 반복"
                  aria-pressed={false}
                  onClick={() => onUpdate({ recurrenceUntil: "" })}
                >
                  계속 반복
                </Chip>
              )}
            </div>
          </div>
        )}
      </div>

      <hr className="border-hairline-soft" />

      <div className="space-y-md">
        <div className="space-y-xs">
          <Label>구분</Label>
          {/* INFO: REQUIREMENTS.md § 11.5. A distinction, not a privacy control — a `mine` event stays fully visible to the other person, title included (§ 18. #9). */}
          <div
            className="flex gap-xs"
            role="radiogroup"
            aria-label="구분"
            onKeyDown={handleRadioKeyDown}
          >
            {scopeOptions.map((scope, index) => {
              const isSelected = draft.scope === scope;
              return (
                <Chip
                  key={scope}
                  role="radio"
                  haptic
                  isSelected={isSelected}
                  tabIndex={index === selectedScopeIndex ? 0 : -1}
                  aria-checked={isSelected}
                  onClick={() => onUpdate({ scope })}
                >
                  {scope === "shared" ? "우리 일정" : "내 일정"}
                </Chip>
              );
            })}
          </div>
        </div>

        {/* INFO: REQUIREMENTS.md § 16.3. One switch for the event, not per user — whoever turns it off silences it for both. */}
        <SettingsRow
          rowClassName="rounded-md border border-hairline-soft bg-surface-soft"
          description={REMINDER_HINTS[draft.reminderEnabled ? draft.scope : "off"]}
          Icon={draft.reminderEnabled ? Bell : BellOff}
          label="알림 받기"
          trailing={
            <Switch
              checked={draft.reminderEnabled}
              haptic
              aria-label="알림 받기"
              onCheckedChange={(reminderEnabled) => onUpdate({ reminderEnabled })}
            />
          }
        />

        {!isEditing && writableCalendars && writableCalendars.length >= 2 && (
          <div className="space-y-xs">
            <Label>Google 캘린더 선택</Label>
            <div
              className="flex flex-wrap gap-xs"
              role="radiogroup"
              aria-label="Google 캘린더 선택"
              onKeyDown={handleRadioKeyDown}
            >
              {writableCalendars.map((calendar, index) => {
                const isSelected = effectiveTargetCalendarId === calendar.calendarId;
                return (
                  <Chip
                    key={calendar.calendarId}
                    role="radio"
                    haptic
                    isSelected={isSelected}
                    tabIndex={index === selectedCalendarIndex ? 0 : -1}
                    aria-checked={isSelected}
                    onClick={() => onUpdate({ targetCalendarId: calendar.calendarId })}
                  >
                    <span className="max-w-56 truncate">{calendar.summary}</span>
                  </Chip>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-xs">
        <Label>메모</Label>
        <Textarea
          className="min-h-24"
          maxLength={MAX_EVENT_DESCRIPTION_LENGTH}
          placeholder="메모 (선택)"
          value={draft.description}
          aria-label="메모"
          onChange={(event) => onUpdate({ description: event.target.value })}
        />
      </div>

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

type DateTimeRowProps = {
  className?: string;
  dateAriaLabel: string;
  dayKey: string;
  isTimeHidden: boolean;
  time: string;
  timeAriaLabel: string;
  onDayKeyChange: (dayKey: string) => void;
  onTimeChange: (time: string) => void;
};

function DateTimeRow({
  className,
  dateAriaLabel,
  dayKey,
  isTimeHidden,
  time,
  timeAriaLabel,
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
        aria-label={dateAriaLabel}
        onChange={(event) => onDayKeyChange(event.target.value)}
      />
      {!isTimeHidden && (
        <Input
          className="w-36 shrink-0 px-3"
          type="time"
          value={time}
          aria-label={timeAriaLabel}
          onChange={(event) => onTimeChange(event.target.value)}
        />
      )}
    </div>
  );
}
