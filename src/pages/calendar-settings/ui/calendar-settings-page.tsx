"use client";

import type { GoogleCalendarOverview } from "@/entities/google-calendar";
import {
  disconnectGoogleCalendar,
  fetchGoogleCalendarOverview,
  syncGoogleCalendar,
  updateDefaultGoogleCalendar,
  updateGoogleCalendarSources,
} from "@/features/google-calendar";
import {
  APP_NAME,
  CALENDAR_ROUTE,
  CALENDAR_SETTINGS_ROUTE,
  GOOGLE_CALENDAR_CONNECT_PATH,
  SETTINGS_ROUTE,
} from "@/shared/config";
import {
  A_SECOND,
  cn,
  useDecryptedServerPayload,
  useRovingTabIndex,
  type Nullable,
} from "@/shared/lib";
import { OFFLINE_MESSAGES, useOfflineGate } from "@/shared/offline-ux";
import {
  AppHeader,
  Button,
  Chip,
  IconButton,
  Modal,
  RelativeTime,
  SettingsRow,
  Switch,
  toast,
} from "@/shared/ui";
import { ChevronLeft, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarSettingsFallback } from "./calendar-settings-fallback";

export type CalendarSettingsSeed = {
  connectedFlag: boolean;
  errorCode: Nullable<string>;
  initialOverview: GoogleCalendarOverview;
};

export type CalendarSettingsPageProps = {
  className?: string;
  encryptedPayload: string;
};

const ERROR_MESSAGES: Record<string, string> = {
  denied: "Google 캘린더 연결이 취소되었어요",
  failed: "Google 캘린더를 연결하지 못했어요",
  missing_scope: "Google 동의 화면에서 캘린더 접근 권한을 체크해 주세요",
  no_refresh_token: "권한 동의를 다시 진행해 주세요",
  unverified: "이메일 인증이 완료된 Google 계정만 연결할 수 있어요",
};

export function CalendarSettingsPage({ className, encryptedPayload }: CalendarSettingsPageProps) {
  const seed = useDecryptedServerPayload<CalendarSettingsSeed>(encryptedPayload);

  if (!seed) {
    return <CalendarSettingsFallback className={className} />;
  }

  return (
    <CalendarSettingsView
      className={className}
      connectedFlag={seed.connectedFlag}
      errorCode={seed.errorCode}
      initialOverview={seed.initialOverview}
    />
  );
}

type CalendarSettingsViewProps = {
  className?: string;
  connectedFlag: boolean;
  errorCode: Nullable<string>;
  initialOverview: GoogleCalendarOverview;
};

function CalendarSettingsView({
  className,
  connectedFlag,
  errorCode,
  initialOverview,
}: CalendarSettingsViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isFromCalendar = searchParams?.get("from") === "calendar";
  const connectGate = useOfflineGate(OFFLINE_MESSAGES.connect);
  const syncGate = useOfflineGate(OFFLINE_MESSAGES.sync);

  const [overview, setOverview] = useState<GoogleCalendarOverview>(initialOverview);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isErrorDismissed, setIsErrorDismissed] = useState(false);

  const didAutoSync = useRef(false);
  const hasRefreshedSources = useRef(false);
  const syncDebounceRef = useRef<Nullable<ReturnType<typeof setTimeout>>>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (syncDebounceRef.current) {
        clearTimeout(syncDebounceRef.current);
      }
    };
  }, []);

  // INFO: Immediately clean up query params so refreshes or back-nav never re-trigger banners.
  useEffect(() => {
    if (connectedFlag || errorCode) {
      const cleanUrl = isFromCalendar
        ? `${CALENDAR_SETTINGS_ROUTE}?from=calendar`
        : CALENDAR_SETTINGS_ROUTE;
      window.history.replaceState(null, "", cleanUrl);
    }
  }, [connectedFlag, errorCode, isFromCalendar]);

  const handleSync = useCallback(
    async (options?: { isInitialConnect?: boolean; silentSuccess?: boolean }) => {
      setIsSyncing(true);

      try {
        const result = await syncGoogleCalendar();

        if (!isMountedRef.current) {
          return;
        }

        if (result.syncError === "reauth_required") {
          toast.error("Google 계정 재연결이 필요해요");
        } else if (result.syncError === "api_disabled") {
          toast.error("Google Cloud에서 Calendar API를 사용 설정해 주세요");
        } else if (result.syncError) {
          toast.error("동기화하지 못했어요");
        } else if (options?.isInitialConnect) {
          toast.success("Google 캘린더가 연결되었어요");
        } else if (!options?.silentSuccess) {
          if (result.changed || (result.exported ?? 0) > 0) {
            toast.success("Google 캘린더 변경 사항을 반영했어요");
          } else {
            toast.success("이미 최신 상태예요");
          }
        }

        const fresh = await fetchGoogleCalendarOverview({ refresh: true });
        if (isMountedRef.current) {
          setOverview(fresh);
        }
      } catch {
        if (isMountedRef.current) {
          toast.error("동기화하지 못했어요");
        }
      } finally {
        if (isMountedRef.current) {
          setIsSyncing(false);
        }
      }
    },
    [],
  );

  // INFO: Refresh secondary sources from Google at most once on mount when connected.
  useEffect(() => {
    if (!overview.account || hasRefreshedSources.current) {
      return;
    }

    hasRefreshedSources.current = true;

    if (connectedFlag) {
      return;
    }

    let isMounted = true;

    void fetchGoogleCalendarOverview({ refresh: true })
      .then((fresh) => {
        if (isMounted && isMountedRef.current) {
          setOverview(fresh);
        }
      })
      .catch(() => undefined);

    return () => {
      isMounted = false;
    };
  }, [overview.account, connectedFlag]);

  useEffect(() => {
    if (connectedFlag && !didAutoSync.current) {
      didAutoSync.current = true;
      void handleSync({ isInitialConnect: true });
    }
  }, [connectedFlag, handleSync]);

  const errorMessage = errorCode ? (ERROR_MESSAGES[errorCode] ?? ERROR_MESSAGES.failed) : null;

  const writableSources = overview.sources.filter(
    (source) => source.isWritable && source.syncEnabled,
  );
  const handleDefaultCalendarKeyDown = useRovingTabIndex({
    orientation: "horizontal",
    selector: "[role='radio']",
  });
  const selectedDefaultIndex = Math.max(
    0,
    writableSources.findIndex((s) => s.calendarId === overview.account?.defaultCalendarId),
  );

  return (
    <div
      className={cn("mx-auto flex w-full max-w-(--content-max-width) flex-1 flex-col", className)}
    >
      <AppHeader
        title="캘린더 설정"
        leading={
          <IconButton
            variant="floating"
            Icon={ChevronLeft}
            haptic
            aria-label="뒤로"
            onClick={() => router.push(isFromCalendar ? CALENDAR_ROUTE : SETTINGS_ROUTE)}
          />
        }
      />

      <div className="flex flex-col pt-(--app-header-inset) pb-lg">
        {errorMessage && !isErrorDismissed && (
          <div className="px-md pt-md">
            <div
              className="flex items-center justify-between gap-sm rounded-lg border border-hairline-soft bg-surface-soft p-md text-body-sm text-semantic-error"
              role="alert"
            >
              <span>{errorMessage}</span>
              <IconButton
                buttonClassName="size-8"
                iconClassName="size-4"
                Icon={X}
                haptic
                aria-label="오류 메시지 닫기"
                onClick={() => setIsErrorDismissed(true)}
              />
            </div>
          </div>
        )}

        {!overview.account ? (
          <div className="px-md pt-md">
            <div className="space-y-sm rounded-lg border border-hairline-soft bg-surface-soft p-md">
              <h3 className="text-body-lg font-semibold text-ink">Google 캘린더 연동</h3>
              <p className="text-body-sm text-body">
                내 Google 캘린더 일정을 달력에 함께 표시하고, {APP_NAME}에서 만든 일정도 Google
                캘린더와 양방향으로 동기화해요.
              </p>
              <p className="text-caption text-meta">
                우리 일정은 연동된 두 분의 달력에, 내 일정은 내 달력에만 반영돼요.
              </p>
              <Button
                haptic
                onClick={connectGate.guard(() => {
                  window.location.assign(GOOGLE_CALENDAR_CONNECT_PATH);
                })}
              >
                Google 캘린더 연결
              </Button>
            </div>
          </div>
        ) : (
          <>
            {overview.account.syncError === "reauth_required" && (
              <div className="px-md pt-md">
                <div className="space-y-xs rounded-lg border border-hairline bg-surface-soft p-md">
                  <p className="text-body-sm font-medium text-semantic-error">
                    Google 계정 인증이 만료되었어요. 다시 연결하면 동기화가 재개돼요.
                  </p>
                  <Button
                    className="w-auto"
                    variant="secondary"
                    haptic
                    onClick={connectGate.guard(() => {
                      window.location.assign(GOOGLE_CALENDAR_CONNECT_PATH);
                    })}
                  >
                    다시 연결
                  </Button>
                </div>
              </div>
            )}

            {overview.account.syncError === "api_disabled" && (
              <div className="px-md pt-md">
                <div
                  className="space-y-xs rounded-lg border border-hairline bg-surface-soft p-md"
                  role="alert"
                >
                  <p className="text-body-sm font-medium text-semantic-error">
                    Google Cloud 콘솔에서 Google Calendar API가 비활성화되어 있어요.
                  </p>
                  <p className="text-caption text-body">
                    Google Cloud 콘솔의 ‘API 및 서비스 → 라이브러리’에서 Google Calendar API를 사용
                    설정한 뒤 ‘지금 동기화’를 눌러 주세요.
                  </p>
                </div>
              </div>
            )}

            <div className="px-md pt-md">
              <div className="space-y-sm rounded-lg border border-hairline-soft bg-surface-soft p-md">
                <div className="flex items-center justify-between gap-sm">
                  <div className="min-w-0 flex-1 space-y-2xs">
                    <p className="truncate text-body-md font-medium text-ink">
                      {overview.account.googleEmail}
                    </p>
                    <p className="text-caption text-meta">
                      마지막 동기화:{" "}
                      {overview.account.lastSyncedAt ? (
                        <RelativeTime date={overview.account.lastSyncedAt} />
                      ) : (
                        "아직 동기화 전"
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex gap-xs pt-2xs">
                  <Button
                    className="flex-1"
                    variant="secondary"
                    disabled={isSyncing}
                    haptic
                    onClick={() => syncGate.guard(() => void handleSync())()}
                  >
                    {isSyncing ? "동기화 중..." : "지금 동기화"}
                  </Button>
                  <Button
                    className="flex-1"
                    variant="ghost"
                    haptic
                    onClick={() => setIsDisconnectModalOpen(true)}
                  >
                    연동 해제
                  </Button>
                </div>
              </div>
            </div>

            {writableSources.length >= 2 && (
              <div className="space-y-xs px-md pt-md">
                <p className="text-caption font-medium text-meta">새 일정을 추가할 기본 달력</p>
                <div
                  className="flex flex-wrap gap-xs"
                  role="radiogroup"
                  aria-label="새 일정을 추가할 기본 달력"
                  onKeyDown={handleDefaultCalendarKeyDown}
                >
                  {writableSources.map((source, index) => (
                    <Chip
                      key={source.calendarId}
                      role="radio"
                      haptic
                      tabIndex={index === selectedDefaultIndex ? 0 : -1}
                      isSelected={overview.account?.defaultCalendarId === source.calendarId}
                      aria-checked={overview.account?.defaultCalendarId === source.calendarId}
                      onClick={() => void selectDefaultCalendar(source.calendarId)}
                    >
                      <span className="max-w-56 truncate">{source.summary}</span>
                    </Chip>
                  ))}
                </div>
              </div>
            )}

            {writableSources.length === 1 && (
              <div className="px-md pt-md">
                <p className="text-body-sm text-meta">
                  새 일정은{" "}
                  <span className="font-medium text-ink">{writableSources[0].summary}</span>에
                  추가돼요.
                </p>
              </div>
            )}

            {overview.sources.length > 0 ? (
              <div>
                <div className="px-md pt-lg pb-xs">
                  <h2 className="text-caption font-semibold text-meta">가져올 달력</h2>
                </div>
                <div>
                  {overview.sources.map((source) => (
                    <SettingsRow
                      key={source.calendarId}
                      iconClassName="size-2.5 self-center"
                      label={source.summary}
                      description={
                        source.isPrimary
                          ? "기본 캘린더"
                          : source.isWritable
                            ? "보조 캘린더 · 쓰기 가능"
                            : "구독 캘린더 · 읽기 전용"
                      }
                      Icon={(props) => (
                        <svg
                          {...props}
                          className={cn("size-2.5 shrink-0 self-center", props.className)}
                          viewBox="0 0 10 10"
                          aria-hidden="true"
                        >
                          <circle
                            cx="5"
                            cy="5"
                            r="5"
                            fill={source.backgroundColor ?? "var(--color-primary)"}
                          />
                        </svg>
                      )}
                      trailing={
                        source.isPrimary ? (
                          <span className="text-caption font-medium text-meta">
                            기본 달력 · 항상 동기화
                          </span>
                        ) : (
                          <Switch
                            checked={source.syncEnabled}
                            haptic
                            aria-label={`${source.summary} 동기화`}
                            onCheckedChange={(checked) =>
                              void toggleSource(source.calendarId, checked)
                            }
                          />
                        )
                      }
                    />
                  ))}
                </div>
              </div>
            ) : (
              overview.account.syncError !== "api_disabled" &&
              overview.account.syncError !== "reauth_required" && (
                <div className="px-md pt-md">
                  <p className="text-body-sm text-meta">
                    달력 목록을 아직 불러오지 못했어요. 잠시 후 ‘지금 동기화’를 눌러 다시 시도해
                    주세요.
                  </p>
                </div>
              )
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={isDisconnectModalOpen}
        header={{ title: "Google 캘린더 연동을 해제할까요?" }}
        onClose={() => setIsDisconnectModalOpen(false)}
      >
        <div className="space-y-md">
          <p className="text-body-sm text-meta">
            Google 캘린더에서 가져온 일정은 {APP_NAME}에서 사라지고, {APP_NAME}에서 Google 캘린더로
            내보냈던 일정은 Google 캘린더에서 정리돼요. {APP_NAME}에 직접 등록한 일정은 {APP_NAME}에
            그대로 유지돼요.
          </p>
          <div className="flex gap-xs">
            <Button
              className="flex-1"
              variant="secondary"
              haptic
              onClick={() => setIsDisconnectModalOpen(false)}
            >
              취소
            </Button>
            <Button
              className="flex-1"
              variant="destructive"
              disabled={isDisconnecting}
              haptic
              onClick={() => void handleDisconnect()}
            >
              연동 해제
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );

  async function selectDefaultCalendar(calendarId: string) {
    if (overview.account?.defaultCalendarId === calendarId) {
      return;
    }

    try {
      const updated = await updateDefaultGoogleCalendar(calendarId);
      if (isMountedRef.current) {
        setOverview(updated);
      }
    } catch {
      if (isMountedRef.current) {
        toast.error("기본 달력을 변경하지 못했어요");
      }
    }
  }

  async function toggleSource(calendarId: string, syncEnabled: boolean) {
    if (
      !syncEnabled &&
      overview.sources.find((source) => source.calendarId === calendarId)?.isPrimary
    ) {
      return;
    }

    setOverview((previous) => {
      if (
        !syncEnabled &&
        previous.sources.find((source) => source.calendarId === calendarId)?.isPrimary
      ) {
        return previous;
      }

      return {
        ...previous,
        sources: previous.sources.map((source) =>
          source.calendarId === calendarId ? { ...source, syncEnabled } : source,
        ),
      };
    });

    try {
      const updated = await updateGoogleCalendarSources([{ calendarId, syncEnabled }]);
      if (isMountedRef.current) {
        setOverview(updated);
      }

      if (syncEnabled) {
        if (syncDebounceRef.current) {
          clearTimeout(syncDebounceRef.current);
        }
        syncDebounceRef.current = setTimeout(() => {
          void syncGoogleCalendar().catch(() => undefined);
        }, A_SECOND / 2);
      }
    } catch {
      if (isMountedRef.current) {
        setOverview((previous) => ({
          ...previous,
          sources: previous.sources.map((source) =>
            source.calendarId === calendarId ? { ...source, syncEnabled: !syncEnabled } : source,
          ),
        }));
        toast.error("달력 설정을 변경하지 못했어요");
      }
    }
  }

  async function handleDisconnect() {
    setIsDisconnecting(true);

    try {
      await disconnectGoogleCalendar();
      if (isMountedRef.current) {
        setOverview({ account: null, sources: [] });
        setIsDisconnectModalOpen(false);
        toast.success("Google 캘린더 연동을 해제했어요");
      }
    } catch {
      if (isMountedRef.current) {
        toast.error("연동을 해제하지 못했어요");
      }
    } finally {
      if (isMountedRef.current) {
        setIsDisconnecting(false);
      }
    }
  }
}
