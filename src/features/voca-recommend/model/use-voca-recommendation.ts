"use client";

import { josa } from "es-hangul";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import type {
  VocaRecommendGrade,
  VocaRecommendItem,
  VocaRecommendTag,
  VocaWordGenerationStatus,
} from "./types";

export type UseVocaRecommendationOptions = {
  isOpen: boolean;
  initialTag?: VocaRecommendTag;
  initialGrade?: VocaRecommendGrade;
  onCardCreated?: () => void;
};

export function useVocaRecommendation({
  isOpen,
  initialTag = "전체",
  initialGrade = "core",
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

  // Prevent multiple initial fetches
  const hasLoadedRef = useRef(false);

  const fetchRecommendations = useCallback(
    async (overrideTag?: VocaRecommendTag, overrideGrade?: VocaRecommendGrade) => {
      setIsLoading(true);
      try {
        const activeTag = overrideTag ?? tag;
        const activeGrade = overrideGrade ?? grade;

        const res = await fetch("/api/voca/recommend", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tag: activeTag,
            grade: activeGrade,
            customTopic: customTopic.trim() || undefined,
            count: 8,
          }),
        });

        if (!res.ok) {
          throw new Error(`Failed to fetch recommendations: ${res.status}`);
        }

        const data = await res.json();
        setItems(data.items ?? []);
      } catch (error) {
        console.error("[useVocaRecommendation] Fetch failed:", error);
        toast.error("추천 단어 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
      } finally {
        setIsLoading(false);
      }
    },
    [tag, grade, customTopic],
  );

  // Initial fetch when opened for the first time
  useEffect(() => {
    if (isOpen && !hasLoadedRef.current) {
      hasLoadedRef.current = true;
      void fetchRecommendations();
    }
  }, [isOpen, fetchRecommendations]);

  const handleSelectTag = (nextTag: VocaRecommendTag) => {
    setTag(nextTag);
    void fetchRecommendations(nextTag, grade);
  };

  const handleSelectGrade = (nextGrade: VocaRecommendGrade) => {
    setGrade(nextGrade);
    void fetchRecommendations(tag, nextGrade);
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
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          word: item.targetWord,
          mode: "sync",
        }),
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

  return {
    tag,
    grade,
    customTopic,
    isCustomInputOpen,
    items,
    isLoading,
    generationStatuses,
    isGeneratingAny,
    hasCreatedAny,
    setCustomTopic,
    setIsCustomInputOpen,
    handleSelectTag,
    handleSelectGrade,
    handleCustomTopicSubmit,
    fetchRecommendations,
    generateCard,
  };
}
