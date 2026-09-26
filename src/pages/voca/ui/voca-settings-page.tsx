"use client";

import type { VocaUserSettings } from "@/entities/voca";
import { VOCA_REMINDER_COOKIE_NAME, VOCA_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import {
  ActionSheet,
  AppHeader,
  Container,
  IconButton,
  SettingsRow,
  Switch,
  type ActionSheetItem,
} from "@/shared/ui";
import { josa } from "es-hangul";
import { Bell, Check, ChevronDown, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";

export type VocaSettingsPageProps = {
  className?: string;
  initialSettings: VocaUserSettings;
};

const DAILY_NEW_CARDS_OPTIONS = [
  { label: "5장", value: 5 },
  { label: "10장", value: 10 },
  { label: "15장 (권장)", value: 15 },
  { label: "20장", value: 20 },
  { label: "30장", value: 30 },
  { label: "50장", value: 50 },
] as const;

const DAILY_REVIEW_LIMIT_OPTIONS = [
  { label: "제한 없음 (권장)", value: null },
  { label: "50장", value: 50 },
  { label: "100장", value: 100 },
  { label: "150장", value: 150 },
  { label: "200장", value: 200 },
] as const;

export function VocaSettingsPage({ className, initialSettings }: VocaSettingsPageProps) {
  const router = useRouter();
  const [dailyNewCards, setDailyNewCards] = useState(initialSettings.dailyNewCards);
  const [dailyReviewLimit, setDailyReviewLimit] = useState<number | null>(
    initialSettings.dailyReviewLimit,
  );
  const [reminderEnabled, setReminderEnabled] = useState(initialSettings.reminderEnabled);
  const [desiredRetention, setDesiredRetention] = useState(initialSettings.desiredRetention);

  const [isNewCardsOpen, setIsNewCardsOpen] = useState(false);
  const [isReviewLimitOpen, setIsReviewLimitOpen] = useState(false);
  const newCardsTriggerRef = useRef<HTMLButtonElement>(null);
  const reviewLimitTriggerRef = useRef<HTMLButtonElement>(null);
  const lastSavedRetentionRef = useRef(initialSettings.desiredRetention);

  const updateSetting = async (patch: Partial<VocaUserSettings>) => {
    try {
      const res = await fetch("/api/voca/settings", {
        body: JSON.stringify(patch),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error("Failed to update setting");
      }
    } catch (err) {
      console.error(err);
      toast.error("설정 변경에 실패했어요.");
    }
  };

  const selectedNewCardsOption = DAILY_NEW_CARDS_OPTIONS.find(
    (opt) => opt.value === dailyNewCards,
  ) ?? { label: `${dailyNewCards}장`, value: dailyNewCards };

  const selectedReviewLimitOption =
    DAILY_REVIEW_LIMIT_OPTIONS.find((opt) => opt.value === dailyReviewLimit) ??
    (dailyReviewLimit === null
      ? { label: "제한 없음 (권장)", value: null }
      : { label: `${dailyReviewLimit}장`, value: dailyReviewLimit });

  const newCardsItems: ActionSheetItem[] = DAILY_NEW_CARDS_OPTIONS.map((opt) => ({
    Icon: dailyNewCards === opt.value ? Check : undefined,
    label: opt.label,
    onSelect: () => {
      setDailyNewCards(opt.value);
      setIsNewCardsOpen(false);
      void updateSetting({ dailyNewCards: opt.value });
      toast.success(`일일 새 단어 학습량을 ${josa(`${opt.value}장`, "으로/로")} 변경했어요.`);
    },
  }));

  const reviewLimitItems: ActionSheetItem[] = DAILY_REVIEW_LIMIT_OPTIONS.map((opt) => ({
    Icon: dailyReviewLimit === opt.value ? Check : undefined,
    label: opt.label,
    onSelect: () => {
      setDailyReviewLimit(opt.value);
      setIsReviewLimitOpen(false);
      void updateSetting({ dailyReviewLimit: opt.value });
      const label = opt.value === null ? "제한 없음" : `${opt.value}장`;
      toast.success(`일일 최대 복습 카드 수를 ${josa(label, "으로/로")} 변경했어요.`);
    },
  }));

  const handleCommitRetention = (val: number) => {
    if (val === lastSavedRetentionRef.current) {
      return;
    }
    lastSavedRetentionRef.current = val;
    void updateSetting({ desiredRetention: val });
    toast.success(`목표 유지율을 ${Math.round(val * 100)}%로 변경했어요.`);
  };

  const handleToggleReminder = async (checked: boolean) => {
    setReminderEnabled(checked);

    // Sync cookie immediately
    if (typeof document !== "undefined") {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${VOCA_REMINDER_COOKIE_NAME}=${checked}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    }

    try {
      const res = await fetch("/api/voca/settings", {
        body: JSON.stringify({ reminderEnabled: checked }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error("Failed to save reminder preference");
      }
      toast.success(checked ? "매일 아침 8시 복습 알림을 켰어요." : "복습 알림을 껐어요.");
    } catch (err) {
      console.error(err);
      toast.error("알림 설정 변경에 실패했어요.");
    }
  };

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="영단어 설정"
        leading={
          <IconButton
            Icon={ChevronLeft}
            haptic
            variant="floating"
            aria-label="영단어로 돌아가기"
            onClick={() => router.push(VOCA_ROUTE)}
          />
        }
      />

      <Container
        className="space-y-lg py-md pt-[calc(var(--app-header-inset)+var(--spacing-md))] pb-2xl"
        size="md"
      >
        {/* Settings Group: Daily limits */}
        <div className="bg-surface overflow-hidden rounded-2xl border border-hairline shadow-sm">
          <div className="border-b border-hairline/60 bg-surface-soft/40 px-4 py-3">
            <h3 className="text-caption font-semibold text-meta uppercase">일일 학습량</h3>
          </div>

          <div>
            <SettingsRow
              rowClassName="bg-surface"
              description="하루에 새로 공부할 단어 카드 수"
              haptic
              label="일일 새 단어 학습량"
              trailing={
                <button
                  ref={newCardsTriggerRef}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-body-sm font-medium text-ink transition-colors hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsNewCardsOpen(true);
                  }}
                >
                  <span>{selectedNewCardsOption.label}</span>
                  <ChevronDown className="size-3.5 text-meta" />
                </button>
              }
              onClick={() => setIsNewCardsOpen(true)}
            />

            <SettingsRow
              className="border-b-0"
              rowClassName="bg-surface border-b-0"
              description="하루에 배정되는 최대 복습 카드 한도"
              haptic
              label="일일 최대 복습 카드 수"
              trailing={
                <button
                  ref={reviewLimitTriggerRef}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-body-sm font-medium text-ink transition-colors hover:bg-surface-strong focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsReviewLimitOpen(true);
                  }}
                >
                  <span>{selectedReviewLimitOption.label}</span>
                  <ChevronDown className="size-3.5 text-meta" />
                </button>
              }
              onClick={() => setIsReviewLimitOpen(true)}
            />
          </div>
        </div>

        {/* Settings Group: Retention & Algorithm */}
        <div className="bg-surface overflow-hidden rounded-2xl border border-hairline shadow-sm">
          <div className="border-b border-hairline/60 bg-surface-soft/40 px-4 py-3">
            <h3 className="text-caption font-semibold text-meta uppercase">
              FSRS 기억 유지율 (Retention)
            </h3>
          </div>

          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-medium text-ink">목표 유지율</span>
              <span className="text-body-sm font-bold text-primary">
                {Math.round(desiredRetention * 100)}%
              </span>
            </div>

            <input
              className="w-full accent-primary"
              max={0.95}
              min={0.8}
              step={0.01}
              type="range"
              value={desiredRetention}
              onChange={(e) => setDesiredRetention(parseFloat(e.target.value))}
              onKeyUp={(e) => handleCommitRetention(parseFloat(e.currentTarget.value))}
              onPointerUp={(e) => handleCommitRetention(parseFloat(e.currentTarget.value))}
            />
            <div className="flex justify-between text-caption text-meta">
              <span>80% (간격 김 · 복습 적음)</span>
              <span>90% (표준)</span>
              <span>95% (간격 짧음 · 완벽 암기)</span>
            </div>
          </div>
        </div>

        {/* Settings Group: Reminder Notification */}
        <div className="bg-surface overflow-hidden rounded-2xl border border-hairline shadow-sm">
          <div className="border-b border-hairline/60 bg-surface-soft/40 px-4 py-3">
            <h3 className="text-caption font-semibold text-meta uppercase">복습 알림</h3>
          </div>

          <SettingsRow
            rowClassName="bg-surface"
            Icon={Bell}
            description="매일 오전 8시(KST)에 복습할 단어가 있을 때 웹 푸시를 받아요"
            label="아침 복습 알림"
            trailing={
              <Switch
                checked={reminderEnabled}
                haptic
                aria-label="아침 복습 알림"
                onCheckedChange={handleToggleReminder}
              />
            }
          />
        </div>
      </Container>

      {/* Action Sheets for Mobile BottomSheet / Desktop Dropdown Menu (Popover) */}
      <ActionSheet
        anchorRef={newCardsTriggerRef}
        header={{ title: "일일 새 단어 학습량" }}
        isOpen={isNewCardsOpen}
        items={newCardsItems}
        onClose={() => setIsNewCardsOpen(false)}
      />

      <ActionSheet
        anchorRef={reviewLimitTriggerRef}
        header={{ title: "일일 최대 복습 카드 수" }}
        isOpen={isReviewLimitOpen}
        items={reviewLimitItems}
        onClose={() => setIsReviewLimitOpen(false)}
      />
    </div>
  );
}
