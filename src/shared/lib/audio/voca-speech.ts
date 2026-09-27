"use client";

import type { Maybe, Nullable } from "../nullish";

let activeUtterance: Nullable<SpeechSynthesisUtterance> = null;
let cancelTimer: Nullable<NodeJS.Timeout> = null;

/**
 * Cleans raw sentence text for text-to-speech fallback, removing <b> tags and underscores.
 */
export function cleanSentenceForSpeech(sentence: string, targetWord: string): string {
  if (!sentence) {
    return "";
  }
  return sentence
    .replace(/<\/?b>/gi, "")
    .replace(/_{3,}/g, targetWord.trim())
    .trim();
}

/**
 * Checks whether an audio URL is a valid, fetchable web address or blob.
 * Rejects Anki audio references (e.g. "[sound:word.mp3]"), HTML, or empty values.
 */
export function isValidAudioUrl(url?: Maybe<string>): boolean {
  if (!url) {
    return false;
  }
  const trimmed = url.trim();
  if (!trimmed || trimmed.startsWith("[sound:") || trimmed.startsWith("<")) {
    return false;
  }
  return (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("blob:")
  );
}

/**
 * Finds the highest quality English voice available in the current browser.
 */
export function getEnglishVoice(): Nullable<SpeechSynthesisVoice> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return null;
  }

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) {
    return null;
  }

  // 1. Preferred high-quality natural voices (macOS / Chrome)
  const preferred = voices.find((v) => {
    const lang = v.lang.replace("_", "-").toLowerCase();
    const name = v.name.toLowerCase();
    return (
      (lang === "en-us" || lang === "en-gb" || lang === "en-au") &&
      (name.includes("natural") ||
        name.includes("samantha") ||
        name.includes("google") ||
        name.includes("daniel") ||
        name.includes("karen"))
    );
  });
  if (preferred) {
    return preferred;
  }

  // 2. Any US English voice
  const enUs = voices.find((v) => v.lang.replace("_", "-").toLowerCase() === "en-us");
  if (enUs) {
    return enUs;
  }

  // 3. Any English voice
  const anyEn = voices.find((v) => v.lang.toLowerCase().startsWith("en"));
  return anyEn ?? null;
}

/**
 * Pre-warms the browser's speech synthesis engine and voices cache during a user gesture.
 */
export function warmSpeechVoices(): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  try {
    window.speechSynthesis.getVoices();
  } catch {
    // Ignore environments where speech synthesis is disabled
  }
}

export type SpeakVocaOptions = {
  rate?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: unknown) => void;
};

/**
 * Stops any active speech synthesis and clears pending timers and references.
 */
export function stopVocaSpeech(): void {
  if (cancelTimer) {
    clearTimeout(cancelTimer);
    cancelTimer = null;
  }
  activeUtterance = null;
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
  }
}

/**
 * Speaks the provided English text using the Web Speech API with V8 GC protection
 * and anti-collision delays when resetting the speech queue.
 */
export function speakVocaText(text: string, options: SpeakVocaOptions = {}): () => void {
  const { rate = 0.9, onStart, onEnd, onError } = options;

  if (!text || typeof window === "undefined" || !("speechSynthesis" in window)) {
    onEnd?.();
    return () => {};
  }

  const cleanText = text.trim();
  if (!cleanText) {
    onEnd?.();
    return () => {};
  }

  const wasSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
  stopVocaSpeech();

  const executeSpeak = () => {
    try {
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.lang = "en-US";
      utterance.rate = rate;

      const voice = getEnglishVoice();
      if (voice) {
        utterance.voice = voice;
      }

      // Retain reference to prevent V8 garbage collector from reclaiming before onend
      activeUtterance = utterance;

      utterance.onstart = () => {
        onStart?.();
      };

      utterance.onend = () => {
        activeUtterance = null;
        onEnd?.();
      };

      utterance.onerror = (event) => {
        activeUtterance = null;
        // If canceled intentionally by a subsequent track or user action, do not treat as an error
        if (event.error === "canceled" || event.error === "interrupted") {
          return;
        }
        onError?.(event);
        onEnd?.();
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      activeUtterance = null;
      onError?.(err);
      onEnd?.();
    }
  };

  // If previous speech was cancelled, wait 40ms for the OS speech dispatcher to reset
  if (wasSpeaking) {
    cancelTimer = setTimeout(executeSpeak, 40);
  } else {
    executeSpeak();
  }

  return () => {
    stopVocaSpeech();
  };
}
