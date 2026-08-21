"use client";

import type { MediaDraft } from "@/entities/media";
import {
  AnimateVideoError,
  VideoCropper,
  VideoTrimmer,
  animateVideo,
  extractVideoAudio,
  revokePreview,
  toEncodedEmoticonDrafts,
  toMediaDraft,
  toStoredMime,
  type EmoticonImageDrafts,
  type TrimRange,
} from "@/features/upload-media/@x/author-emoticon";
import { EMOTICON_MAX_EDGE, MAX_EMOTICON_VIDEO_DURATION, isVideoMime } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { VideoEncodingOverlay, type EncodeProgress } from "../ui/video-encoding-overlay";

/** What a clip becomes: the two image slots, and the sound under the range that was kept. */
export type VideoEmoticon = {
  image: EmoticonImageDrafts;
  audio: Nullable<File>;
  /** INFO: § 13.4.1. Handed back so the sheet can re-open this flow on the clip itself — a shorter cut or a tighter frame is a second run over the source, never an edit of the animation it produced. */
  source: File;
};

type Stage =
  | { name: "trimming"; source: File; draft: MediaDraft; range?: TrimRange }
  | { name: "cropping"; source: File; range: TrimRange; draft: MediaDraft }
  | { name: "encoding"; progress: EncodeProgress };

export type UseVideoEmoticonParams = {
  onReady: (result: VideoEmoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.4.1. Pick, cut to `MAX_EMOTICON_VIDEO_DURATION`, frame, and
 * come out with the slots § 13.4.'s sheet stages. The overlay is handed back
 * separately so the sheet can mount it outside itself.
 *
 * WARN: The crop is a rectangle handed to `cropVideo` at `EMOTICON_MAX_EDGE`, never
 * a crop of the finished animation — a canvas crop decodes one frame and would turn
 * the animation into a picture (§ 13.4.).
 */
export function useVideoEmoticon({ onReady }: UseVideoEmoticonParams) {
  const [stage, setStage] = useState<Nullable<Stage>>(null);
  const stageRef = useRef<Nullable<Stage>>(null);
  // WARN: What tells an abandoned run's result from the live one. `ffmpeg.exec` cannot be interrupted without tearing down the cached core, so 취소 stops caring about the encode rather than stopping it.
  const runRef = useRef(0);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // WARN: On unmount alone, never keyed on `stage` — a cleanup that ran per stage would revoke a live poster under StrictMode's setup → cleanup → setup. 취소 covers the user's exit; this covers navigating off the screen mid-flow.
  useEffect(
    () => () => {
      if (stageRef.current && stageRef.current.name !== "encoding") {
        revokePreview(stageRef.current.draft);
      }
    },
    [],
  );

  // INFO: § 13.4.'s rule for `MediaEditor`, and for the same reason — these overlays portal into the app shell while the authoring sheet portals into `body`, so the sheet has to close rather than be layered under.
  return { isActive: stage !== null, open, overlay: renderOverlay() };

  function renderOverlay(): ReactNode {
    if (!stage) {
      return null;
    }

    if (stage.name === "encoding") {
      return <VideoEncodingOverlay progress={stage.progress} onCancel={cancel} />;
    }

    if (stage.name === "trimming") {
      return (
        <VideoTrimmer
          key={stage.draft.id}
          draft={stage.draft}
          limit={{ kind: "ceiling", durationMs: MAX_EMOTICON_VIDEO_DURATION }}
          keepsAudio
          hasNextStep
          initialRange={stage.range}
          onCancel={cancel}
          onDone={(file, range) => void crop(file, range)}
        />
      );
    }

    return (
      <VideoCropper
        key={stage.draft.id}
        draft={stage.draft}
        maxEdge={EMOTICON_MAX_EDGE}
        onCancel={cancel}
        onBack={() => void back()}
        onDone={(file) => void encode(file)}
      />
    );
  }

  async function open(file: File) {
    // INFO: § 12.1.'s three containers, which is what `trimVideo` and `cropVideo` carry demuxers for — the picker's `video/*` admits more than that.
    if (!isVideoMime(toStoredMime(file))) {
      toast.error("지원하지 않는 형식이에요");

      return;
    }

    try {
      setStage({ name: "trimming", source: file, draft: await toMediaDraft(file) });
    } catch (error) {
      report(error);
      toast.error("영상을 읽지 못했어요");
    }
  }

  async function crop(trimmed: File, range: TrimRange) {
    // WARN: The ref, not the render's own `stage` — 뒤로 puts this flow back on the trimmer while `cropVideo` may still be running, and a closure taken before that would carry on as if it had not.
    const current = stageRef.current;

    if (current?.name !== "trimming") {
      return;
    }

    const { source, draft } = current;
    // WARN: Claimed, not merely read. `VideoTrimmer` re-enables 완료 the moment `trimVideo` resolves — this runs unawaited — so a second tap cuts the clip again and lands here with a closure that passes the same guard.
    const run = ++runRef.current;

    try {
      // WARN: The poster of the **trimmed** clip, so the stencil is drawn over a frame the user actually kept.
      const next = await toMediaDraft(trimmed);

      // WARN: 완료 leaves the trimmer's 취소 live for as long as this decode runs, and a cancelled flow must not be resurrected by the stage it was waiting on.
      if (runRef.current !== run) {
        revokePreview(next);

        return;
      }

      setStage({ name: "cropping", source, range, draft: next });
      revokePreview(draft);
    } catch (error) {
      report(error);
      toast.error("영상을 읽지 못했어요");
    }
  }

  async function encode(cropped: File) {
    const current = stageRef.current;

    if (current?.name !== "cropping") {
      return;
    }

    const { source, range, draft } = current;
    const run = ++runRef.current;

    setStage({ name: "encoding", progress: "preparing" });
    revokePreview(draft);

    try {
      // INFO: § 13.4.1. The sound is read off the **source** at the kept range — `trimVideo` and `cropVideo` both discard the track, for a reason they each state.
      // WARN: Started here and awaited below, so the percentage covers the encode alone. Inside the `Promise.all`, a slow demux of a long source held the bar at 100% with nothing saying why.
      const sound = extractVideoAudio(source, range);
      const animation = await animateVideo(cropped, EMOTICON_MAX_EDGE, (ratio) =>
        setProgress(run, ratio),
      );

      setProgress(run, "finishing");

      const [image, audio] = await Promise.all([toEncodedEmoticonDrafts(animation), sound]);

      if (runRef.current !== run) {
        discard(image);

        return;
      }

      setStage(null);
      onReady({ image, audio, source });
    } catch (error) {
      report(error);

      if (runRef.current === run) {
        setStage(null);
        toast.error(toFailureMessage(error));
      }
    }
  }

  /** INFO: § 13.4.1. 영역 자르기 steps back into the trimmer rather than out of the flow, on the clip it was reached from and at the cut it was reached with. */
  async function back() {
    const current = stageRef.current;

    if (current?.name !== "cropping") {
      return;
    }

    const { source, range, draft } = current;
    // WARN: Claimed for `crop`'s reason — a crop that is still running must not land on the trimmer this puts the user back on.
    const run = ++runRef.current;

    try {
      // INFO: The source's own poster again: the trimmer measures the whole clip, where the draft being left behind is the cut one.
      const next = await toMediaDraft(source);

      if (runRef.current !== run) {
        revokePreview(next);

        return;
      }

      setStage({ name: "trimming", source, draft: next, range });
      revokePreview(draft);
    } catch (error) {
      report(error);
      toast.error("영상을 읽지 못했어요");
    }
  }

  function setProgress(run: number, progress: EncodeProgress) {
    if (runRef.current === run) {
      setStage((current) =>
        current?.name === "encoding" ? { name: "encoding", progress } : current,
      );
    }
  }

  // WARN: The only surface these failures have. Every one of them is a decoder or a wasm core refusing a clip, and the sentence the user gets cannot carry the reason.
  function report(error: unknown) {
    console.error("[emoticon] a clip could not be made into one", error);
  }

  function cancel() {
    runRef.current++;

    if (stage && stage.name !== "encoding") {
      revokePreview(stage.draft);
    }

    setStage(null);
  }
}

// INFO: Only the size ladder leaves the user a move; every other failure is this build refusing the clip, which a shorter cut does not fix.
function toFailureMessage(error: unknown): string {
  return error instanceof AnimateVideoError && error.failure === "oversize"
    ? "잘라낸 구간이 너무 커요. 더 짧게 잘라 보세요"
    : "이 영상은 이모티콘으로 만들 수 없어요";
}

function discard({ still, animated }: EmoticonImageDrafts) {
  revokePreview(still);

  if (animated) {
    revokePreview(animated);
  }
}
