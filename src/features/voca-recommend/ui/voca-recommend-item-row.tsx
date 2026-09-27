"use client";

import { cn } from "@/shared/lib";
import { Button } from "@/shared/ui";
import { AlertCircle, Check, RotateCw, Sparkles } from "lucide-react";
import type { VocaRecommendItem, VocaWordGenerationStatus } from "../model/types";

export type VocaRecommendItemRowProps = {
  className?: string;
  item: VocaRecommendItem;
  status?: VocaWordGenerationStatus;
  onGenerate: (item: VocaRecommendItem) => void;
};

export function VocaRecommendItemRow({
  className,
  item,
  status = "idle",
  onGenerate,
}: VocaRecommendItemRowProps) {
  return (
    <div
      className={cn(
        "bg-surface flex items-center justify-between gap-3 rounded-2xl border border-hairline p-3.5 transition-colors hover:border-hairline-strong",
        className,
      )}
    >
      {/* Word & Definition */}
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="text-title-sm font-bold text-ink">{item.targetWord}</span>
          <span className="rounded-md bg-surface-soft px-1.5 py-0.5 text-caption font-semibold text-meta">
            {item.pos}
          </span>
        </div>
        <p className="line-clamp-1 text-body-sm text-meta">{item.koreanMeaning}</p>
      </div>

      {/* Action Button depending on status */}
      <div className="shrink-0">
        {status === "idle" && (
          <Button
            className="w-auto"
            buttonClassName="min-h-9 w-auto px-3 py-1 text-button-sm rounded-xl gap-1.5"
            variant="secondary"
            haptic
            onClick={() => onGenerate(item)}
          >
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            생성하기
          </Button>
        )}

        {status === "loading" && (
          <Button
            className="w-auto"
            buttonClassName="min-h-9 w-auto px-3 py-1 text-button-sm rounded-xl gap-1.5 text-meta"
            variant="secondary"
            disabled
          >
            <RotateCw className="h-3.5 w-3.5 animate-spin text-primary" />
            생성 중...
          </Button>
        )}

        {status === "added" && (
          <Button
            className="w-auto"
            buttonClassName="min-h-9 w-auto px-3 py-1 text-button-sm rounded-xl gap-1 bg-surface-soft border border-hairline text-semantic-success"
            variant="ghost"
            disabled
          >
            <Check className="h-4 w-4" />
            추가됨
          </Button>
        )}

        {status === "failed" && (
          <Button
            className="w-auto"
            buttonClassName="min-h-9 w-auto px-3 py-1 text-button-sm rounded-xl gap-1"
            variant="destructive"
            haptic
            onClick={() => onGenerate(item)}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            다시 시도
          </Button>
        )}
      </div>
    </div>
  );
}
