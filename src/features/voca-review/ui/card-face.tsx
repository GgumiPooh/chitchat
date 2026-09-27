"use client";

import type { VocaCard } from "@/entities/voca";
import { cn, isCommandKey } from "@/shared/lib";
import { VocaAudioButton } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

export type CardFaceProps = {
  className?: string;
  contentClassName?: string;
  card: VocaCard;
  side: "front" | "back";
  autoplayAudio?: boolean;
};

/**
 * Parses inline <b>...</b> tags safely without dangerouslySetInnerHTML.
 */
function renderRichText(text: string, boldClassName = "font-bold text-primary"): ReactNode {
  if (!text) {
    return null;
  }

  const parts = text.split(/(<b>[\s\S]*?<\/b>)/gi);
  if (parts.length === 1 && !text.includes("<b>") && !text.includes("</b>")) {
    return text;
  }

  return parts.map((part, index) => {
    const match = /^<b>([\s\S]*?)<\/b>$/i.exec(part);
    if (match) {
      return (
        <b key={index} className={boldClassName}>
          {match[1]}
        </b>
      );
    }
    const cleanPart = part.replace(/<\/?b>/gi, "");
    return <span key={index}>{cleanPart}</span>;
  });
}

/**
 * Cleans raw sentence text for text-to-speech fallback, removing <b> tags and underscores.
 */
function cleanSentenceForSpeech(sentence: string, targetWord: string): string {
  return sentence
    .replace(/<\/?b>/gi, "")
    .replace(/_{3,}/g, targetWord)
    .trim();
}

/**
 * On the front of the card, displays the sentence with the target word replaced by a blank.
 */
function renderBlankSentence(sentence: string, targetWord: string): ReactNode {
  let normalized = sentence;
  const blankMarker = "__VOCA_BLANK__";
  const hasUnderscores = /(?:<b>)?_{3,}(?:<\/b>)?/i.test(normalized);

  if (hasUnderscores) {
    normalized = normalized.replace(/(?:<b>)?_{3,}(?:<\/b>)?/i, blankMarker);
  } else {
    const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:<b>)?${escaped}(?:<\\/b>)?`, "gi");
    if (regex.test(normalized)) {
      normalized = normalized.replace(regex, blankMarker);
    } else {
      normalized = `${normalized} ${blankMarker}`;
    }
  }

  const parts = normalized.split(/(__VOCA_BLANK__|<b>[\s\S]*?<\/b>)/gi);

  return parts.map((part, index) => {
    if (part === blankMarker) {
      return (
        <b
          key={index}
          className="font-bold tracking-wider text-ink underline decoration-primary decoration-2 underline-offset-4"
        >
          __________
        </b>
      );
    }

    const boldMatch = /^<b>([\s\S]*?)<\/b>$/i.exec(part);
    if (boldMatch) {
      return (
        <b key={index} className="font-semibold text-ink">
          {boldMatch[1]}
        </b>
      );
    }

    const clean = part.replace(/<\/?b>/gi, "");
    return <span key={index}>{clean}</span>;
  });
}

function formatPos(pos: string): string {
  if (!pos) {
    return "";
  }
  const clean = pos.trim().toLowerCase().replace(/\.$/, "");
  const map: Record<string, string> = {
    n: "NOUN",
    noun: "NOUN",
    v: "VERB",
    verb: "VERB",
    adj: "ADJ",
    adjective: "ADJ",
    adv: "ADV",
    adverb: "ADV",
    prep: "PREP",
    preposition: "PREP",
    conj: "CONJ",
    conjunction: "CONJ",
    pron: "PRON",
    pronoun: "PRON",
    phr: "PHRASE",
    phrase: "PHRASE",
    idiom: "IDIOM",
  };
  return map[clean] ?? clean.toUpperCase();
}

/**
 * On the back of the card, displays the sentence with the target word filled in and highlighted.
 */
function renderFilledSentence(sentence: string, targetWord: string): ReactNode {
  let normalized = sentence;
  const wordMarker = "__VOCA_WORD__";
  const hasUnderscores = /(?:<b>)?_{3,}(?:<\/b>)?/i.test(normalized);

  if (hasUnderscores) {
    normalized = normalized.replace(/(?:<b>)?_{3,}(?:<\/b>)?/i, wordMarker);
  } else {
    const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?:<b>)?${escaped}(?:<\\/b>)?`, "gi");
    if (regex.test(normalized)) {
      normalized = normalized.replace(regex, wordMarker);
    } else {
      normalized = `${normalized} (${wordMarker})`;
    }
  }

  const parts = normalized.split(/(__VOCA_WORD__|<b>[\s\S]*?<\/b>)/gi);

  return parts.map((part, index) => {
    if (part === wordMarker) {
      return (
        <b key={index} className="font-bold text-primary underline decoration-2 underline-offset-4">
          {targetWord}
        </b>
      );
    }

    const boldMatch = /^<b>([\s\S]*?)<\/b>$/i.exec(part);
    if (boldMatch) {
      return (
        <b key={index} className="font-semibold text-ink">
          {boldMatch[1]}
        </b>
      );
    }

    const clean = part.replace(/<\/?b>/gi, "");
    return <span key={index}>{clean}</span>;
  });
}

export function CardFace({
  className,
  contentClassName,
  card,
  side,
  autoplayAudio = false,
}: CardFaceProps) {
  const [activeTrack, setActiveTrack] = useState<"word" | "sentence" | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const stopAllAudio = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.onplay = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setActiveTrack(null);
  }, []);

  const playTrack = useCallback(
    (track: "word" | "sentence", onEnd?: () => void) => {
      stopAllAudio();
      setActiveTrack(track);

      const audioUrl = track === "word" ? card.audioUrl : card.sentenceAudioUrl;
      const fallbackText =
        track === "word" ? card.targetWord : cleanSentenceForSpeech(card.sentence, card.targetWord);

      const speakFallback = () => {
        if (!fallbackText || typeof window === "undefined" || !("speechSynthesis" in window)) {
          setActiveTrack(null);
          onEnd?.();
          return;
        }

        try {
          window.speechSynthesis.cancel();
          const utterance = new SpeechSynthesisUtterance(fallbackText);
          utterance.lang = "en-US";
          utterance.rate = 0.9;
          utterance.onstart = () => {
            setActiveTrack(track);
          };
          utterance.onend = () => {
            setActiveTrack(null);
            onEnd?.();
          };
          utterance.onerror = () => {
            setActiveTrack(null);
            onEnd?.();
          };
          window.speechSynthesis.speak(utterance);
        } catch {
          setActiveTrack(null);
          onEnd?.();
        }
      };

      if (audioUrl) {
        if (!audioRef.current && typeof Audio !== "undefined") {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        if (audio) {
          audio.src = audioUrl;
          audio.onplay = () => {
            setActiveTrack(track);
          };
          audio.onended = () => {
            setActiveTrack(null);
            onEnd?.();
          };
          audio.onerror = () => {
            speakFallback();
          };

          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise.catch(() => {
              speakFallback();
            });
          }
          return;
        }
      }

      if (fallbackText) {
        speakFallback();
      } else {
        setActiveTrack(null);
        onEnd?.();
      }
    },
    [card.audioUrl, card.sentenceAudioUrl, card.sentence, card.targetWord, stopAllAudio],
  );

  const playSequence = useCallback(() => {
    playTrack("word", () => {
      timerRef.current = setTimeout(() => {
        playTrack("sentence");
      }, 300);
    });
  }, [playTrack]);

  // Autoplay sequence when flipped to back
  useEffect(() => {
    if (side !== "back" || !autoplayAudio) {
      return;
    }

    playSequence();

    return () => {
      stopAllAudio();
    };
  }, [side, autoplayAudio, playSequence, stopAllAudio]);

  // Keyboard shortcut 'R' to replay sequence on back face
  useEffect(() => {
    if (side !== "back") {
      return;
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) {
        return;
      }
      if (e.key.toLowerCase() === "r" && !isCommandKey(e)) {
        e.preventDefault();
        playSequence();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [side, playSequence]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const handleToggleWord = () => {
    if (activeTrack === "word") {
      stopAllAudio();
    } else {
      playTrack("word");
    }
  };

  const handleToggleSentence = () => {
    if (activeTrack === "sentence") {
      stopAllAudio();
    } else {
      playTrack("sentence");
    }
  };

  if (side === "front") {
    return (
      <div
        className={cn(
          "bg-surface flex min-h-[260px] flex-col justify-between rounded-2xl border border-hairline p-6 shadow-sm sm:min-h-[300px] sm:rounded-3xl sm:p-8",
          className,
        )}
      >
        <div
          className={cn(
            "flex flex-1 flex-col items-center justify-center space-y-6 py-4 text-center",
            contentClassName,
          )}
        >
          {/* Main Sentence with blank */}
          <div className="mx-auto max-w-xl text-display-sm leading-relaxed font-medium text-ink sm:text-display-md">
            {renderBlankSentence(card.sentence, card.targetWord)}
          </div>

          {/* Definition box */}
          {card.englishDefinition && (
            <div className="mx-auto max-w-xl rounded-2xl bg-surface-soft/80 px-6 py-4 text-center">
              <p className="text-body-sm leading-relaxed text-body italic sm:text-body-md">
                {card.englishDefinition}
              </p>
            </div>
          )}
        </div>

        <div className="pt-4 text-center text-caption text-meta select-none">
          카드를 탭하여 정답과 해설 보기
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface flex min-h-[300px] flex-col rounded-2xl border border-hairline p-6 shadow-sm sm:rounded-3xl sm:p-8",
        className,
      )}
    >
      <div className={cn("space-y-6", contentClassName)}>
        {/* Header: Target word, POS badge + Pronunciation, word audio, Korean meaning */}
        <div className="flex flex-col items-center space-y-3 pt-1 text-center">
          <h2 className="text-display-md font-bold tracking-tight text-ink sm:text-display-lg">
            {card.targetWord}
          </h2>

          <div className="flex items-center justify-center gap-2">
            <span className="text-white inline-flex items-center justify-center rounded-full bg-ai px-2.5 py-0.5 text-micro font-bold tracking-wider uppercase dark:text-canvas">
              {formatPos(card.pos)}
            </span>
            {card.pronunciation && (
              <span className="font-mono text-body-sm text-meta">{card.pronunciation}</span>
            )}
          </div>

          <div className="pt-0.5">
            <VocaAudioButton
              audioUrl={card.audioUrl}
              isPlaying={activeTrack === "word"}
              label={`${card.targetWord} 발음 듣기`}
              size="md"
              variant="play"
              textToSpeak={card.targetWord}
              onTogglePlay={handleToggleWord}
            />
          </div>

          <div className="pt-1 text-display-sm font-bold text-ink sm:text-display-md">
            {card.koreanMeaning}
          </div>
        </div>

        {/* Divider */}
        <hr className="my-2 w-full border-t border-hairline/80" />

        {/* Filled sentence with sentence audio */}
        <div className="flex flex-col items-center space-y-3 text-center">
          <div className="mx-auto max-w-xl text-body-md leading-relaxed font-normal text-ink sm:text-title-sm">
            {renderFilledSentence(card.sentence, card.targetWord)}
          </div>

          <div className="pt-0.5">
            <VocaAudioButton
              audioUrl={card.sentenceAudioUrl}
              isPlaying={activeTrack === "sentence"}
              label="예문 전체 듣기"
              size="md"
              variant="play"
              textToSpeak={cleanSentenceForSpeech(card.sentence, card.targetWord)}
              onTogglePlay={handleToggleSentence}
            />
          </div>
        </div>

        {/* Section Cards: Confusable, Collocations, Word Family, Examples */}
        <div className="space-y-3 pt-2">
          {card.confusable && (
            <div className="space-y-1.5 rounded-2xl border border-hairline/80 bg-surface-soft/40 p-4 shadow-2xs">
              <span className="block text-micro font-bold tracking-widest text-ai uppercase">
                Confusable
              </span>
              <div className="text-body-sm leading-relaxed text-ink">{card.confusable}</div>
            </div>
          )}

          {card.collocations && (
            <div className="space-y-1.5 rounded-2xl border border-hairline/80 bg-surface-soft/40 p-4 shadow-2xs">
              <span className="block text-micro font-bold tracking-widest text-ai uppercase">
                Collocations
              </span>
              <div className="text-body-sm leading-relaxed text-ink">{card.collocations}</div>
            </div>
          )}

          {card.wordFamily && (
            <div className="space-y-1.5 rounded-2xl border border-hairline/80 bg-surface-soft/40 p-4 shadow-2xs">
              <span className="block text-micro font-bold tracking-widest text-ai uppercase">
                Word Family
              </span>
              <div className="text-body-sm leading-relaxed text-ink">{card.wordFamily}</div>
            </div>
          )}

          {card.examples && card.examples.length > 0 && (
            <div className="space-y-2 rounded-2xl border border-hairline/80 bg-surface-soft/40 p-4 shadow-2xs">
              <span className="block text-micro font-bold tracking-widest text-ai uppercase">
                Examples
              </span>
              <ul className="divide-y divide-hairline/50 text-body-sm text-ink">
                {card.examples.slice(0, 3).map((example, idx) => (
                  <li key={idx} className={cn("leading-relaxed", idx > 0 && "pt-2.5")}>
                    {renderRichText(example, "font-bold text-primary")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
