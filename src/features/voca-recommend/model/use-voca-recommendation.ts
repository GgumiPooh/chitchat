"use client";

import { josa } from "es-hangul";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import type {
  VocaRecommendGrade,
  VocaRecommendItem,
  VocaRecommendTag,
  VocaWordGenerationStatus,
} from "./types";

export type UseVocaRecommendationOptions = {
  initialGrade?: VocaRecommendGrade;
  initialTag?: VocaRecommendTag;
  isOpen: boolean;
  onCardCreated?: () => void;
};

export function useVocaRecommendation({
  initialGrade = "core",
  initialTag = "전체",
  onCardCreated,
}: UseVocaRecommendationOptions) {
  const [tag, setTag] = useState<VocaRecommendTag>(initialTag);
  const [grade, setGrade] = useState<VocaRecommendGrade>(initialGrade);
  const [customTopic, setCustomTopic] = useState("");
  const [isCustomInputOpen, setIsCustomInputOpen] = useState(false);

  const [items, setItems] = useState<VocaRecommendItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [generationStatuses, setGenerationStatuses] = useState<
    Record<string, VocaWordGenerationStatus>
  >({});
  const [hasCreatedAny, setHasCreatedAny] = useState(false);

  // Tracks what parameters were used in the last successful fetch
  const [lastFetchedParams, setLastFetchedParams] = useState<{
    customTopic: string;
    grade: VocaRecommendGrade;
    tag: VocaRecommendTag;
  } | null>(null);

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/voca/recommend", {
        body: JSON.stringify({
          count: 8,
          customTopic: customTopic.trim() || undefined,
          grade,
          tag,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch recommendations: ${res.status}`);
      }

      const data = await res.json();
      setItems(data.items ?? []);
      setLastFetchedParams({
        customTopic: customTopic.trim(),
        grade,
        tag,
      });
    } catch (error) {
      console.error("[useVocaRecommendation] Fetch failed:", error);
      toast.error("추천 단어 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setIsLoading(false);
    }
  }, [tag, grade, customTopic]);

  // Pure selection updates: NO automatic network requests on filter click!
  const handleSelectTag = (nextTag: VocaRecommendTag) => {
    setTag(nextTag);
  };

  const handleSelectGrade = (nextGrade: VocaRecommendGrade) => {
    setGrade(nextGrade);
  };

  const handleCustomTopicSubmit = () => {
    if (!customTopic.trim()) {
      return;
    }
    void fetchRecommendations();
  };

  const generateCard = async (item: VocaRecommendItem) => {
    const wordKey = item.targetWord.toLowerCase();
    setGenerationStatuses((prev) => ({ ...prev, [wordKey]: "loading" }));

    try {
      const res = await fetch("/api/voca/ai-generate", {
        body: JSON.stringify({
          mode: "sync",
          word: item.targetWord,
        }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });

      if (!res.ok) {
        throw new Error(`Generation failed with status ${res.status}`);
      }

      setGenerationStatuses((prev) => ({ ...prev, [wordKey]: "added" }));
      setHasCreatedAny(true);
      toast.success(`${josa(item.targetWord, "이/가")} 단어장에 추가되었어요.`);
      onCardCreated?.();
    } catch (err) {
      console.error(`[useVocaRecommendation] Card creation failed for: ${item.targetWord}`, err);
      setGenerationStatuses((prev) => ({ ...prev, [wordKey]: "failed" }));
      toast.error(`${josa(item.targetWord, "을/를")} 추가하지 못했어요. 다시 시도해주세요.`);
    }
  };

  const isGeneratingAny = Object.values(generationStatuses).some((status) => status === "loading");

  const hasFetched = lastFetchedParams !== null;
  const isFilterChanged =
    hasFetched &&
    (lastFetchedParams.tag !== tag ||
      lastFetchedParams.grade !== grade ||
      lastFetchedParams.customTopic !== customTopic.trim());

  return {
    customTopic,
    fetchRecommendations,
    generateCard,
    generationStatuses,
    grade,
    handleCustomTopicSubmit,
    handleSelectGrade,
    handleSelectTag,
    hasCreatedAny,
    hasFetched,
    isCustomInputOpen,
    isFilterChanged,
    isGeneratingAny,
    isLoading,
    items,
    setCustomTopic,
    setIsCustomInputOpen,
    tag,
  };
}
