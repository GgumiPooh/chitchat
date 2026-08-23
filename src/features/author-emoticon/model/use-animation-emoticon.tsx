"use client";

import type { MediaDraft } from "@/entities/media";
import {
  AnimateVideoError,
  CutoutEditor,
  VideoCropper,
  animateImage,
  releaseFfmpeg,
  revokePreview,
  toEncodedEmoticonDrafts,
  toMediaDraft,
  type CropRectangle,
  type EmoticonImageDrafts,
  type Rotation,
} from "@/features/upload-media/@x/author-emoticon";
import { EMOTICON_MAX_EDGE } from "@/shared/config";
import type { Nullable } from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { VideoEncodingOverlay, type EncodeProgress } from "../ui/video-encoding-overlay";

/** What an animation becomes: the two image slots, the still re-extracted from the new animation so the two never disagree. */
export type AnimationEmoticon = {
  image: EmoticonImageDrafts;
};

type Stage =
  | { name: "matting"; source: File; draft: MediaDraft }
  | { name: "cropping"; source: File; draft: MediaDraft; isCutout: boolean }
  | { name: "encoding"; progress: EncodeProgress };

export type UseAnimationEmoticonParams = {
  onReady: (result: AnimationEmoticon) => void;
};

/**
 * REQUIREMENTS.md § 13.4.1. `useVideoEmoticon` without the trimmer: an animation is
 * already the length it is, so 누끼 and 영역 자르기 are the whole of the flow, and
 * both a picked GIF and a stored animated item enter it from the sheet's thumbnail.
 *
 * WARN: The crop leaves 영역 자르기 as a rectangle rather than a file — `animateImage`
 * folds it into the one encode, where a crop pass of its own would spend a generation
 * on bytes that are already lossy.
 */
export function useAnimationEmoticon({ onReady }: UseAnimationEmoticonParams) {
  const [stage, setStage] = useState<Nullable<Stage>>(null);
  const stageRef = useRef<Nullable<Stage>>(null);
  // WARN: `useVideoEmoticon`'s counter, for its reason — 취소 tears the core down, but the frames already matted settle behind it.
  const runRef = useRef(0);

  useEffect(() => {
    stageRef.current = stage;
  }, [stage]);

  // WARN: On unmount alone, never keyed on `stage` — `useVideoEmoticon` carries the argument.
  useEffect(
    () => () => {
      if (stageRef.current && stageRef.current.name !== "encoding") {
        revokePreview(stageRef.current.draft);
      }
    },
    [],
  );

  return { isActive: stage !== null, open, overlay: renderOverlay() };

  function renderOverlay(): ReactNode {
    if (!stage) {
      return null;
    }

    if (stage.name === "encoding") {
      return <VideoEncodingOverlay progress={stage.progress} onCancel={cancel} />;
    }

    if (stage.name === "matting") {
      return (
        // INFO: § 13.4.2. 누끼 is the flow's first screen, so 취소 leaves it — there is no earlier one to step back to.
        <CutoutEditor
          key={stage.draft.id}
          draft={stage.draft}
          model="video"
          onDone={(cutout) => {
            if (cutout) {
              revokePreview(cutout);
            }

            setStage({ ...stage, name: "cropping", isCutout: cutout !== null });
          }}
          onCancel={cancel}
        />
      );
    }

    return (
      <VideoCropper
        key={stage.draft.id}
        draft={stage.draft}
        maxEdge={EMOTICON_MAX_EDGE}
        source="animation"
        onCancel={cancel}
        onBack={() => setStage({ ...stage, name: "matting" })}
        onCrop={(crop, rotate) => void encode(crop, rotate)}
      />
    );
  }

  /** INFO: The draft is read off the animation itself, so its poster is the frame the stencil is measured on and its size is the pixels the crop is reported in. */
  async function open(file: File) {
    // INFO: `animateImage` keeps this as its own invariant; refusing here is so nobody walks 누끼 and 영역 자르기 to reach it.
    if (typeof ImageDecoder === "undefined") {
      toast.error("이 브라우저에서는 움직이는 이미지를 편집할 수 없어요");

      return;
    }

    try {
      setStage({
        name: "matting",
        source: file,
        draft: await toMediaDraft(file, { transparent: true }),
      });
    } catch (error) {
      report(error);
      toast.error("이미지를 읽지 못했어요");
    }
  }

  async function encode(crop: CropRectangle, rotate: Rotation) {
    const current = stageRef.current;

    if (current?.name !== "cropping") {
      return;
    }

    const { source, draft, isCutout } = current;
    const run = ++runRef.current;

    setStage({ name: "encoding", progress: "preparing" });
    revokePreview(draft);

    try {
      const animation = await animateImage(
        source,
        EMOTICON_MAX_EDGE,
        crop,
        rotate,
        (ratio) => setProgress(run, ratio),
        { cutout: isCutout },
      );

      setProgress(run, "finishing");

      const image = await toEncodedEmoticonDrafts(animation);

      if (runRef.current !== run) {
        discard(image);

        return;
      }

      setStage(null);
      onReady({ image });
    } catch (error) {
      report(error);

      if (runRef.current === run) {
        setStage(null);
        toast.error(toFailureMessage(error));
      }
    }
  }

  function setProgress(run: number, progress: EncodeProgress) {
    if (runRef.current === run) {
      setStage((current) =>
        current?.name === "encoding" ? { name: "encoding", progress } : current,
      );
    }
  }

  function report(error: unknown) {
    console.error("[emoticon] an animation could not be re-made into one", error);
  }

  function cancel() {
    runRef.current++;

    if (stage?.name === "encoding") {
      releaseFfmpeg(true);
    } else if (stage) {
      revokePreview(stage.draft);
    }

    setStage(null);
  }
}

// INFO: Only the ladder and a browser with no `ImageDecoder` leave the user anything to do; every other failure is this build refusing the animation.
function toFailureMessage(error: unknown): string {
  if (!(error instanceof AnimateVideoError)) {
    return "이 이미지는 이모티콘으로 만들 수 없어요";
  }

  if (error.failure === "oversize") {
    return "움직이는 이미지가 너무 커요. 영역을 더 좁게 잘라 보세요";
  }

  return error.failure === "decode"
    ? "이 브라우저에서는 움직이는 이미지를 편집할 수 없어요"
    : "이 이미지는 이모티콘으로 만들 수 없어요";
}

function discard({ still, animated }: EmoticonImageDrafts) {
  revokePreview(still);

  if (animated) {
    revokePreview(animated);
  }
}
