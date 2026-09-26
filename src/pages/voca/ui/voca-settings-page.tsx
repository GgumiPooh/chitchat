"use client";

import type { VocaUserSettings } from "@/entities/voca";
import { VOCA_REMINDER_COOKIE_NAME, VOCA_ROUTE } from "@/shared/config";
import { cn } from "@/shared/lib";
import { AppHeader, Button, Container, IconButton, SettingsRow, Switch } from "@/shared/ui";
import { Bell, ChevronLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

export type VocaSettingsPageProps = {
  className?: string;
  initialSettings: VocaUserSettings;
};

export function VocaSettingsPage({ className, initialSettings }: VocaSettingsPageProps) {
  const router = useRouter();
  const [dailyNewCards, setDailyNewCards] = useState(initialSettings.dailyNewCards);
  const [dailyReviewLimit, setDailyReviewLimit] = useState<number | null>(
    initialSettings.dailyReviewLimit,
  );
  const [reminderEnabled, setReminderEnabled] = useState(initialSettings.reminderEnabled);
  const [desiredRetention, setDesiredRetention] = useState(initialSettings.desiredRetention);
  const [isSaving, setIsSaving] = useState(false);

  const handleToggleReminder = async (checked: boolean) => {
    setReminderEnabled(checked);

    // Sync cookie immediately
    if (typeof document !== "undefined") {
      const secure = location.protocol === "https:" ? "; Secure" : "";
      document.cookie = `${VOCA_REMINDER_COOKIE_NAME}=${checked}; path=/; max-age=31536000; SameSite=Lax${secure}`;
    }

    try {
      const res = await fetch("/api/voca/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reminderEnabled: checked }),
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

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      const res = await fetch("/api/voca/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dailyNewCards,
          dailyReviewLimit,
          desiredRetention,
          reminderEnabled,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save settings");
      }

      toast.success("학습 설정을 저장했어요.");
      router.refresh();
    } catch (err) {
      console.error(err);
      toast.error("설정 저장에 실패했어요.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className={cn("flex flex-1 flex-col", className)}>
      <AppHeader
        title="영단어 설정"
        leading={
          <IconButton
            Icon={ChevronLeft}
            variant="floating"
            haptic
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

          <div className="space-y-4 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-body-sm font-medium text-ink">일일 새 단어 학습량</span>
                <p className="text-caption text-meta">하루에 새로 공부할 단어 카드 수</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-body-sm text-ink focus:border-primary focus:outline-none"
                  value={dailyNewCards}
                  onChange={(e) => setDailyNewCards(Number(e.target.value))}
                >
                  <option value={5}>5장</option>
                  <option value={10}>10장</option>
                  <option value={15}>15장 (권장)</option>
                  <option value={20}>20장</option>
                  <option value={30}>30장</option>
                  <option value={50}>50장</option>
                </select>
              </div>
            </div>

            <div className="h-px bg-hairline/60" />

            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <span className="text-body-sm font-medium text-ink">일일 최대 복습 카드 수</span>
                <p className="text-caption text-meta">하루에 배정되는 최대 복습 카드 한도</p>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-body-sm text-ink focus:border-primary focus:outline-none"
                  value={dailyReviewLimit ?? "unlimited"}
                  onChange={(e) =>
                    setDailyReviewLimit(
                      e.target.value === "unlimited" ? null : Number(e.target.value),
                    )
                  }
                >
                  <option value="unlimited">제한 없음 (권장)</option>
                  <option value={50}>50장</option>
                  <option value={100}>100장</option>
                  <option value={150}>150장</option>
                  <option value={200}>200장</option>
                </select>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Group: Retention & Algorithm */}
        <div className="bg-surface overflow-hidden rounded-2xl border border-hairline shadow-sm">
          <div className="border-b border-hairline/60 bg-surface-soft/40 px-4 py-3">
            <h3 className="text-caption font-semibold text-meta uppercase">
              FSRS 기억 유지율 (Retention)
            </h3>
          </div>

          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <span className="text-body-sm font-medium text-ink">목표 암기 유지율</span>
              <span className="font-mono text-body-sm font-bold text-primary">
                {Math.round(desiredRetention * 100)}%
              </span>
            </div>
            <input
              className="w-full accent-primary"
              type="range"
              min={0.8}
              max={0.95}
              step={0.01}
              value={desiredRetention}
              onChange={(e) => setDesiredRetention(parseFloat(e.target.value))}
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
            Icon={Bell}
            label="아침 복습 알림"
            description="매일 오전 8시(KST)에 복습할 단어가 있을 때 웹 푸시를 받아요"
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

        {/* Save Button */}
        <div className="pt-2">
          <Button
            className="w-full"
            variant="primary"
            haptic
            disabled={isSaving}
            onClick={handleSaveAll}
          >
            설정 저장하기
          </Button>
        </div>
      </Container>
    </div>
  );
}
