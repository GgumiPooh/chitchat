"use client";

import type { VocaCard } from "@/entities/voca";
import { cn } from "@/shared/lib";
import { VocaAudioButton } from "@/shared/ui";

export type CardFaceProps = {
  className?: string;
  contentClassName?: string;
  card: VocaCard;
  side: "front" | "back";
  autoplayAudio?: boolean;
};

function renderBlankSentence(sentence: string, targetWord: string) {
  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = sentence.split(regex);

  if (parts.length > 1) {
    return (
      <span>
        {parts.map((part, index) =>
          part.toLowerCase() === targetWord.toLowerCase() ? (
            <b
              key={index}
              className="font-bold tracking-wider text-primary underline underline-offset-4"
            >
              __________
            </b>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </span>
    );
  }

  return (
    <span>
      {sentence}{" "}
      <b className="font-bold tracking-wider text-primary underline underline-offset-4">
        __________
      </b>
    </span>
  );
}

function renderFilledSentence(sentence: string, targetWord: string) {
  const escaped = targetWord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = sentence.split(regex);

  if (parts.length > 1) {
    return (
      <span>
        {parts.map((part, index) =>
          part.toLowerCase() === targetWord.toLowerCase() ? (
            <b key={index} className="font-bold text-primary">
              {part}
            </b>
          ) : (
            <span key={index}>{part}</span>
          ),
        )}
      </span>
    );
  }

  return <span>{sentence}</span>;
}

export function CardFace({
  className,
  contentClassName,
  card,
  side,
  autoplayAudio = false,
}: CardFaceProps) {
  if (side === "front") {
    return (
      <div
        className={cn(
          "bg-surface flex min-h-[300px] flex-col justify-between rounded-2xl border border-hairline p-6 shadow-sm",
          className,
        )}
      >
        <div className={cn("flex flex-1 flex-col justify-center space-y-6", contentClassName)}>
          <div className="space-y-2">
            <span className="text-caption font-semibold tracking-wider text-meta uppercase">
              빈칸 문장 (Context)
            </span>
            <div className="text-title-sm leading-relaxed font-medium text-ink">
              {renderBlankSentence(card.sentence, card.targetWord)}
            </div>
          </div>

          <div className="space-y-1.5 rounded-xl border border-hairline/80 bg-surface-soft/60 p-4">
            <span className="text-caption font-semibold tracking-wider text-meta uppercase">
              영문 정의 (Definition)
            </span>
            <p className="text-body-sm leading-relaxed text-body italic">
              {card.englishDefinition}
            </p>
          </div>
        </div>

        <div className="pt-4 text-center text-caption text-meta">
          카드를 탭하여 정답과 해설 보기
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "bg-surface flex min-h-[300px] flex-col overflow-y-auto rounded-2xl border border-hairline p-6 shadow-sm",
        className,
      )}
    >
      <div className={cn("space-y-5", contentClassName)}>
        {/* Header: Target word, POS, IPA, pronunciation audio button */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h2 className="text-display-sm font-bold tracking-tight text-ink">{card.targetWord}</h2>
            <span className="rounded-md border border-hairline bg-surface-soft px-2 py-0.5 text-caption font-medium text-meta">
              {card.pos}
            </span>
            <span className="font-mono text-body-sm text-meta-soft">{card.pronunciation}</span>
          </div>
          <VocaAudioButton
            audioUrl={card.audioUrl}
            textToSpeak={card.targetWord}
            label={`${card.targetWord} 발음 듣기`}
            autoPlay={autoplayAudio}
            size="md"
          />
        </div>

        {/* Korean meaning */}
        <div className="text-title-sm font-semibold text-primary">{card.koreanMeaning}</div>

        {/* English definition */}
        <p className="text-body-sm leading-relaxed text-body">{card.englishDefinition}</p>

        {/* Divider */}
        <div className="h-px w-full bg-hairline" />

        {/* Filled sentence with sentence audio */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-caption font-semibold tracking-wider text-meta uppercase">
              예문 문맥
            </span>
            <VocaAudioButton
              audioUrl={card.sentenceAudioUrl}
              textToSpeak={card.sentence}
              label="예문 전체 듣기"
              size="sm"
            />
          </div>
          <div className="text-body-md leading-relaxed text-ink">
            {renderFilledSentence(card.sentence, card.targetWord)}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full bg-hairline" />

        {/* Detailed word properties */}
        <div className="space-y-3 text-body-sm">
          {card.collocations && (
            <div>
              <span className="font-semibold text-ink">연어 (Collocations): </span>
              <span className="text-body">{card.collocations}</span>
            </div>
          )}

          {card.confusable && (
            <div>
              <span className="font-semibold text-ink">혼동 주의: </span>
              <span className="text-body">{card.confusable}</span>
            </div>
          )}

          {card.wordFamily && (
            <div>
              <span className="font-semibold text-ink">어휘 계열: </span>
              <span className="text-body">{card.wordFamily}</span>
            </div>
          )}
        </div>

        {/* 3 Example sentences */}
        {card.examples.length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="text-caption font-semibold tracking-wider text-meta uppercase">
              추가 예문
            </span>
            <ul className="space-y-2 text-body-sm text-body">
              {card.examples.slice(0, 3).map((example, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-hairline/60 bg-surface-soft/60 px-3 py-2 leading-relaxed"
                >
                  {example}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
