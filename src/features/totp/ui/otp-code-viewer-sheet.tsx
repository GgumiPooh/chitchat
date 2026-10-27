"use client";

import { cn, type Nullable } from "@/shared/lib";
import { BottomSheet, Button, IconButton, toast } from "@/shared/ui";
import { Check, Clock, Copy, LoaderCircle, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchCurrentOtpCode } from "../api/totp-api";

export type OtpCodeViewerSheetProps = {
  className?: string;
  isOpen: boolean;
  onClose: () => void;
};

export function OtpCodeViewerSheet({ className, isOpen, onClose }: OtpCodeViewerSheetProps) {
  const [code, setCode] = useState<string>("");
  const [period, setPeriod] = useState<number>(30);
  const [remainingSeconds, setRemainingSeconds] = useState<number>(30);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<Nullable<string>>(null);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);

  const nextCodeRef = useRef<string>("");
  const isFetchingRef = useRef(false);

  // INFO: Reset state when sheet transitions between open and closed.
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    if (isOpen) {
      setIsLoading(true);
      setErrorMessage(null);
      setIsCopied(false);
      setIsResetting(false);
    }
  }

  const loadCode = useCallback(async (isInitial = false) => {
    if (isFetchingRef.current) {
      return;
    }
    isFetchingRef.current = true;

    try {
      const data = await fetchCurrentOtpCode();
      setCode(data.code);
      if (data.nextCode) {
        nextCodeRef.current = data.nextCode;
      }
      setPeriod(data.period > 0 ? data.period : 30);
      setRemainingSeconds(data.remainingSeconds);
      setIsCopied(false);
      setErrorMessage(null);
    } catch {
      if (isInitial) {
        setErrorMessage("1회용 번호를 불러오지 못했어요");
      }
    } finally {
      isFetchingRef.current = false;
      if (isInitial) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let cancelled = false;

    fetchCurrentOtpCode()
      .then((data) => {
        if (!cancelled) {
          setCode(data.code);
          if (data.nextCode) {
            nextCodeRef.current = data.nextCode;
          }
          setPeriod(data.period > 0 ? data.period : 30);
          setRemainingSeconds(data.remainingSeconds);
          setIsCopied(false);
          setErrorMessage(null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setErrorMessage("1회용 번호를 불러오지 못했어요");
          setIsLoading(false);
        }
      });

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          if (nextCodeRef.current) {
            setCode(nextCodeRef.current);
            nextCodeRef.current = "";
          }
          setIsResetting(true);
          if (!cancelled) {
            void loadCode(false);
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [isOpen, loadCode]);

  useEffect(() => {
    if (isResetting) {
      const frame = requestAnimationFrame(() => {
        setIsResetting(false);
      });
      return () => cancelAnimationFrame(frame);
    }
  }, [isResetting]);

  const handleCopy = useCallback(async () => {
    if (!code) {
      return;
    }
    try {
      await navigator.clipboard.writeText(code);
      setIsCopied(true);
      toast.success("1회용 번호를 복사했어요");
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      toast.error("1회용 번호를 복사하지 못했어요");
    }
  }, [code]);

  const progressPercent =
    period > 0 ? Math.max(0, Math.min(100, (remainingSeconds / period) * 100)) : 0;
  const isUrgent = remainingSeconds <= 5;

  return (
    <BottomSheet
      className={className}
      isOpen={isOpen}
      header={{
        title: "1회용 로그인 번호",
        description: "다른 기기 로그인 창에 입력해 주세요",
      }}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-md py-md">
        {isLoading ? (
          <div className="flex min-h-[220px] w-full items-center justify-center">
            <LoaderCircle className="size-6 animate-spin text-meta-soft" />
          </div>
        ) : errorMessage ? (
          <div className="flex min-h-[200px] w-full flex-col items-center justify-center gap-sm">
            <p className="text-body-sm text-semantic-error">{errorMessage}</p>
            <Button
              variant="secondary"
              haptic
              onClick={() => {
                setIsLoading(true);
                setErrorMessage(null);
                void loadCode(true);
              }}
            >
              다시 시도
            </Button>
          </div>
        ) : (
          <div className="flex w-full flex-col items-center gap-md">
            {/* Large 6-digit display */}
            <div className="flex w-full max-w-[320px] items-center justify-center gap-sm rounded-2xl border border-hairline bg-surface-soft px-md py-sm">
              <div className="flex items-center gap-xs">
                <span className="font-mono text-3xl font-bold tracking-wider text-ink select-all sm:text-4xl">
                  {code.slice(0, 3)}
                </span>
                <span className="text-xl font-bold text-meta-soft sm:text-2xl">·</span>
                <span className="font-mono text-3xl font-bold tracking-wider text-ink select-all sm:text-4xl">
                  {code.slice(3, 6)}
                </span>
              </div>
              <IconButton
                className="shrink-0"
                variant="plain"
                Icon={isCopied ? Check : Copy}
                haptic
                aria-label="1회용 번호 복사"
                onClick={() => void handleCopy()}
              />
            </div>

            {/* 30-second countdown indicator */}
            <div className="flex w-full max-w-[320px] flex-col gap-xs">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-strong">
                <div
                  className={cn(
                    "h-full rounded-full",
                    isResetting
                      ? "transition-none"
                      : "transition-[width] duration-1000 ease-linear",
                    isUrgent ? "bg-semantic-error" : "bg-primary",
                  )}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex items-center justify-center gap-1.5 text-caption text-meta">
                <Clock className="size-3.5 shrink-0" />
                <span>{remainingSeconds}초 후 새 번호로 변경돼요</span>
              </div>
            </div>

            {/* Info card callout */}
            <div className="flex w-full max-w-[320px] items-start gap-xs rounded-xl bg-surface-soft p-sm text-caption leading-relaxed text-meta">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />
              <div>
                다른 기기 로그인 창에서{" "}
                <strong className="font-semibold text-ink">「1회용 번호로 로그인」</strong>을
                누르고, 위 번호를 입력하면 바로 로그인돼요.
              </div>
            </div>

            {/* Close button */}
            <Button
              className="mt-xs w-full max-w-[320px]"
              variant="secondary"
              haptic
              onClick={onClose}
            >
              닫기
            </Button>
          </div>
        )}
      </div>
    </BottomSheet>
  );
}
