"use client";

import type { Nullable, Optional } from "@/shared/lib";
import { josa } from "es-hangul";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  isVocaRecommendTag,
  type VocaRecommendGrade,
  type VocaRecommendItem,
  type VocaRecommendParams,
  type VocaRecommendResponse,
  type VocaRecommendTag,
  type VocaWordGenerationStatus,
} from "./types";

export type UseVocaRecommendationOptions = {
  initialGrade?: Optional<VocaRecommendGrade>;
  initialTag?: Optional<VocaRecommendTag>;
  isOpen: boolean;
  onCardCreated?: Optional<() => void>;
};

function mergeAddedWords(
  prev: Record<string, VocaWordGenerationStatus>,
  addedWords: string[],
): Record<string, VocaWordGenerationStatus> {
  const next = { ...prev };
  for (const word of addedWords) {
    const key = word.toLowerCase();
    if (next[key] !== "loading") {
      next[key] = "added";
    }
  }
  return next;
}

export function useVocaRecommendation({
  initialGrade = "core",
  initialTag = "전체",
  isOpen,
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

  const [lastFetchedParams, setLastFetchedParams] = useState<Nullable<VocaRecommendParams>>(null);

  // Hydrate saved recommendation state from the server when sheet opens
  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isMounted = true;

    async function hydrate() {
      try {
        const res = await fetch("/api/voca/recommend");
        if (!res.ok || !isMounted) {
          return;
        }

        const data: VocaRecommendResponse = await res.json();
        if (!isMounted) {
          return;
        }

        if (data.addedWords && data.addedWords.length > 0) {
          setGenerationStatuses((prev) => mergeAddedWords(prev, data.addedWords));
        }

        if (data.state) {
          const restoredTag = isVocaRecommendTag(data.state.tag) ? data.state.tag : "전체";
          const restoredGrade = data.state.grade;
          const restoredTopic = data.state.customTopic ?? "";

          setTag(restoredTag);
          setGrade(restoredGrade);
          setCustomTopic(restoredTopic);
          setIsCustomInputOpen(Boolean(restoredTopic));

          if (data.state.status === "completed") {
            setItems(data.state.items ?? []);
            setLastFetchedParams({
              customTopic: restoredTopic,
              grade: restoredGrade,
              tag: restoredTag,
            });
            setIsLoading(false);
          } else if (data.state.status === "pending") {
            setIsLoading(true);
            setLastFetchedParams({
              customTopic: restoredTopic,
              grade: restoredGrade,
              tag: restoredTag,
            });
          } else if (data.state.status === "failed") {
            setIsLoading(false);
          }
        }
      } catch (error) {
        console.error("[useVocaRecommendation] Hydration failed:", error);
      }
    }

    void hydrate();

    return () => {
      isMounted = false;
    };
  }, [isOpen]);

  // Polling interval while recommendation is generating on the server and sheet is open
  useEffect(() => {
    if (!isOpen || !isLoading) {
      return;
    }

    let isMounted = true;
    let isPolling = false;

    const poll = async () => {
      if (isPolling) {
        return;
      }
      isPolling = true;
      try {
        const res = await fetch("/api/voca/recommend");
        if (!res.ok || !isMounted) {
          return;
        }

        const data: VocaRecommendResponse = await res.json();
        if (!isMounted) {
          return;
        }

        if (data.state?.status === "completed") {
          const restoredTag = isVocaRecommendTag(data.state.tag) ? data.state.tag : "전체";
          setItems(data.state.items ?? []);
          setLastFetchedParams({
            customTopic: data.state.customTopic ?? "",
            grade: data.state.grade,
            tag: restoredTag,
          });
          if (data.addedWords && data.addedWords.length > 0) {
            setGenerationStatuses((prev) => mergeAddedWords(prev, data.addedWords));
          }
          setIsLoading(false);
        } else if (data.state?.status === "failed") {
          setIsLoading(false);
          toast.error("추천 단어 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
        }
      } catch (error) {
        console.error("[useVocaRecommendation] Polling failed:", error);
      } finally {
        isPolling = false;
      }
    };

    const timer = setInterval(() => {
      void poll();
    }, 1500);

    return () => {
      isMounted = false;
      clearInterval(timer);
    };
  }, [isOpen, isLoading]);

  const fetchRecommendations = useCallback(async () => {
    setIsLoading(true);
    setItems([]);
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

      setLastFetchedParams({
        customTopic: customTopic.trim(),
        grade,
        tag,
      });
    } catch (error) {
      console.error("[useVocaRecommendation] Fetch failed:", error);
      setIsLoading(false);
      toast.error("추천 단어 목록을 불러오지 못했어요. 잠시 후 다시 시도해주세요.");
    }
  }, [tag, grade, customTopic]);

  const resetList = useCallback(() => {
    setItems([]);
    setGenerationStatuses({});
    setLastFetchedParams(null);
  }, []);

  // Pure selection updates: reset list immediately so stale recommendations are cleared
  const handleSelectTag = (nextTag: VocaRecommendTag) => {
    if (nextTag !== tag) {
      setTag(nextTag);
      resetList();
    }
  };

  const handleSelectGrade = (nextGrade: VocaRecommendGrade) => {
    if (nextGrade !== grade) {
      setGrade(nextGrade);
      resetList();
    }
  };

  const handleCustomTopicChange = (nextTopic: string) => {
    setCustomTopic(nextTopic);
    if (items.length > 0 || lastFetchedParams !== null) {
      resetList();
    }
  };

  const handleToggleCustomInput = () => {
    setIsCustomInputOpen((prev) => !prev);
    resetList();
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

    const effectiveCategory =
      isCustomInputOpen && customTopic.trim() ? customTopic.trim() : tag !== "전체" ? tag : "";
    const tagParts = [effectiveCategory, grade].filter(Boolean);
    const tags = tagParts.length > 0 ? tagParts.join(",") : undefined;

    try {
      const res = await fetch("/api/voca/ai-generate", {
        body: JSON.stringify({
          mode: "sync",
          word: item.targetWord,
          tags,
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
    handleCustomTopicChange,
    handleCustomTopicSubmit,
    handleSelectGrade,
    handleSelectTag,
    handleToggleCustomInput,
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
