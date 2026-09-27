"use client";

import { cn, type Nullable } from "@/shared/lib";
import { Pause, Play, Volume2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export type VocaAudioButtonProps = {
  className?: string;
  iconClassName?: string;
  audioUrl?: Nullable<string>;
  textToSpeak?: string;
  label?: string;
  autoPlay?: boolean;
  size?: "sm" | "md" | "lg";
  variant?: "volume" | "play";
  isPlaying?: boolean;
  onTogglePlay?: () => void;
};

const SIZE_CLASSES = {
  volume: {
    sm: "h-7 w-7 p-1.5",
    md: "h-9 w-9 p-2",
    lg: "h-11 w-11 p-2.5",
  },
  play: {
    sm: "h-8 w-8 p-1.5",
    md: "h-10 w-10 p-2",
    lg: "h-12 w-12 p-2.5",
  },
} as const;

const ICON_SIZE_CLASSES = {
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
  lg: "h-5 w-5",
} as const;

export function VocaAudioButton({
  className,
  iconClassName,
  audioUrl,
  textToSpeak,
  label = "발음 듣기",
  autoPlay = false,
  size = "md",
  variant = "volume",
  isPlaying: isPlayingProp,
  onTogglePlay,
}: VocaAudioButtonProps) {
  const [internalIsPlaying, setInternalIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const isControlled = isPlayingProp !== undefined;
  const isPlaying = isControlled ? isPlayingProp : internalIsPlaying;

  const stopAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setInternalIsPlaying(false);
  }, []);

  const speakFallback = useCallback(() => {
    if (!textToSpeak || typeof window === "undefined" || !("speechSynthesis" in window)) {
      setInternalIsPlaying(false);
      return;
    }

    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(textToSpeak);
      utterance.lang = "en-US";
      utterance.rate = 0.9;

      utterance.onstart = () => setInternalIsPlaying(true);
      utterance.onend = () => setInternalIsPlaying(false);
      utterance.onerror = () => setInternalIsPlaying(false);

      window.speechSynthesis.speak(utterance);
    } catch {
      setInternalIsPlaying(false);
    }
  }, [textToSpeak]);

  const playAudio = useCallback(() => {
    if (audioUrl) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onplay = () => setInternalIsPlaying(true);
      audio.onended = () => {
        setInternalIsPlaying(false);
        audioRef.current = null;
      };
      audio.onerror = () => {
        audioRef.current = null;
        setInternalIsPlaying(false);
        speakFallback();
      };

      audio.play().catch(() => {
        audioRef.current = null;
        setInternalIsPlaying(false);
        speakFallback();
      });
      return;
    }

    if (textToSpeak) {
      speakFallback();
    }
  }, [audioUrl, textToSpeak, speakFallback]);

  useEffect(() => {
    if (!autoPlay || onTogglePlay) {
      return;
    }

    const timer = setTimeout(() => {
      playAudio();
    }, 0);

    return () => {
      clearTimeout(timer);
      stopAudio();
    };
  }, [autoPlay, onTogglePlay, playAudio, stopAudio]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onTogglePlay) {
      onTogglePlay();
      return;
    }

    if (internalIsPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  return (
    <button
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all duration-150 select-none",
        "focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-95",
        "disabled:pointer-events-none disabled:opacity-40",
        variant === "play"
          ? [
              "bg-surface border border-hairline-strong text-ink shadow-2xs hover:border-ink hover:bg-surface-soft active:bg-surface-pressed",
              isPlaying && "border-primary bg-primary/10 text-primary ring-2 ring-primary/30",
            ]
          : [
              "hover:bg-surface bg-surface-soft text-body hover:text-ink",
              isPlaying && "bg-primary/10 text-primary ring-2 ring-primary/30",
            ],
        SIZE_CLASSES[variant][size],
        className,
      )}
      type="button"
      title={label}
      disabled={!audioUrl && !textToSpeak}
      aria-label={label}
      onClick={handleClick}
    >
      {variant === "play" ? (
        isPlaying ? (
          <Pause className={cn(ICON_SIZE_CLASSES[size], "fill-current", iconClassName)} />
        ) : (
          <Play className={cn(ICON_SIZE_CLASSES[size], "ml-0.5 fill-current", iconClassName)} />
        )
      ) : (
        <Volume2
          className={cn(ICON_SIZE_CLASSES[size], isPlaying && "animate-pulse", iconClassName)}
        />
      )}
    </button>
  );
}
