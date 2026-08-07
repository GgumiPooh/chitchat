"use client";

import {
  MAX_VOICE_DURATION,
  MIN_VOICE_DURATION,
  VOICE_LEVEL_WINDOW,
  VOICE_SAMPLE_INTERVAL,
  pickVoiceRecordingMime,
  toStoredVoiceMime,
  toWaveformPeaks,
} from "@/shared/config";
import {
  A_MINUTE,
  A_SECOND,
  declareAudioSession,
  declareRestingAudioSession,
  type Nullable,
} from "@/shared/lib";
import { toast } from "@/shared/ui";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * A finished recording, before it becomes a `MediaDraft` (REQUIREMENTS.md § 9.3.).
 *
 * INFO: Its own type rather than a draft outright — a draft's shape belongs to
 * `entities/media` and to the § 9. upload, while this is what the microphone
 * produced.
 */
export type VoiceRecording = {
  file: File;
  /** The stored base type, codecs parameter already stripped (`toStoredVoiceMime`). */
  mime: string;
  durationMs: number;
  /** REQUIREMENTS.md § 9.3. `VOICE_WAVEFORM_PEAKS` integers, extracted while recording. */
  peaks: number[];
};

export type VoiceRecorderState = "idle" | "requesting" | "recording";

export type UseVoiceRecorderParams = {
  onDone: (recording: VoiceRecording) => void;
};

type RecordingSession = {
  recorder: MediaRecorder;
  stream: MediaStream;
  audio: AudioContext;
  timer: ReturnType<typeof setInterval>;
};

// INFO: The analyser here is a level meter and nothing else, so the smallest window the spec allows is the one that follows speech most closely.
const FFT_SIZE = 256;

// WARN: Three strings, because the recorder refuses for three different reasons. One shared 녹음하지 못했어요 leaves the user whose permission is off with nothing to act on.
const REFUSALS = {
  unsupported: "이 기기에서는 녹음할 수 없어요",
  denied: "마이크 권한이 필요해요",
  failed: "녹음하지 못했어요",
} as const;

/**
 * The microphone behind a voice message (REQUIREMENTS.md § 9.3.).
 *
 * WARN: `start` must be called synchronously inside a user gesture. `getUserMedia`
 * is gated on a transient activation, and iOS additionally refuses to hand over an
 * input stream from a call stack no tap covers.
 */
export function useVoiceRecorder({ onDone }: UseVoiceRecorderParams) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  // INFO: Committed at whole seconds only. The sample loop runs every `VOICE_SAMPLE_INTERVAL`, and re-rendering to redraw a clock that changes once a second is the § 8.3. cost `useSendMessage` avoids the same way for upload progress.
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  // INFO: The live level meter — the last `VOICE_LEVEL_WINDOW` amplitudes, `0`–`1` each. A window rather than the whole recording, so the array React re-renders on cannot grow with the clip.
  const [levels, setLevels] = useState<number[]>([]);
  const sessionRef = useRef<Nullable<RecordingSession>>(null);
  // WARN: A ref, not state. It is read inside `MediaRecorder`'s `onstop`, which runs a tick after the call that set it — a state flag would still be the value that closure captured.
  const isCancelledRef = useRef(false);
  // WARN: Distinct from `isCancelledRef`, which only reaches a recorder that exists. This one covers the window before one does, while `getUserMedia` is still pending.
  const isAbandonedRef = useRef(false);
  const onDoneRef = useRef(onDone);

  // INFO: Read through a ref, so a caller passing a fresh closure every render cannot rebuild the callbacks the running session was opened with.
  useEffect(() => {
    onDoneRef.current = onDone;
  }, [onDone]);

  const release = useCallback(() => {
    const session = sessionRef.current;

    sessionRef.current = null;

    if (session) {
      closeSession(session);
    }
  }, []);

  // WARN: Releasing the tracks is not tidiness. A live `MediaStreamTrack` keeps the OS recording indicator up, and on iOS it holds the audio session away from everything else on the phone.
  useEffect(() => {
    return () => {
      // WARN: The unmount can land while the permission prompt is still up, and `release` has nothing to release then — the flag is what the pending request reads when it finally answers.
      isAbandonedRef.current = true;
      release();
    };
  }, [release]);

  /** Ends the recording and hands it to `onDone`, unless it is too short to be one. */
  const stop = useCallback(() => {
    isCancelledRef.current = false;
    // WARN: 완료 abandons the request too when it lands during `requesting`. There is no recorder to stop yet, and without this a permission granted afterwards opens the microphone because the user pressed the control that means "finish".
    isAbandonedRef.current = true;
    // WARN: Cleared here rather than in `onstop`, which is a queued task. The 50ms sample tick can fire in between, re-toast the cap and call `stop()` on a recorder already `inactive`, which throws `InvalidStateError` out of the interval.
    clearSampling(sessionRef.current);
    sessionRef.current?.recorder.stop();
  }, []);

  /** Ends the recording and throws it away. */
  const cancel = useCallback(() => {
    isCancelledRef.current = true;
    isAbandonedRef.current = true;
    clearSampling(sessionRef.current);
    sessionRef.current?.recorder.stop();
  }, []);

  const handleSample = useCallback(
    (amplitude: number, elapsedMs: number) => {
      setLevels((previous) => [...previous, amplitude].slice(-VOICE_LEVEL_WINDOW));
      setElapsedSeconds(Math.floor(elapsedMs / A_SECOND));

      // INFO: REQUIREMENTS.md § 9.3. The cap stops the recording rather than discarding it — what was said is kept and staged, which is the opposite of losing two minutes to a limit nobody was watching.
      if (elapsedMs >= MAX_VOICE_DURATION) {
        toast.info(`최대 ${MAX_VOICE_DURATION / A_MINUTE}분까지 녹음할 수 있어요`);
        stop();
      }
    },
    [stop],
  );

  const handleFinish = useCallback(
    (chunks: Blob[], mime: string, amplitudes: number[], durationMs: number) => {
      const wasCancelled = isCancelledRef.current;

      release();
      setState("idle");
      setLevels([]);

      if (wasCancelled) {
        return;
      }

      // INFO: § 9.3. A press released immediately is a mis-tap and is dropped silently — a toast there scolds the user for a gesture they had already abandoned.
      if (chunks.length === 0 || durationMs < MIN_VOICE_DURATION) {
        return;
      }

      const storedMime = toStoredVoiceMime(mime);
      const blob = new Blob(chunks, { type: storedMime });

      onDoneRef.current({
        // INFO: R2 keys carry no name and a voice row stores no `filename` (§ 9.3.), so this one never leaves the browser — it exists because `File` requires one and the § 9. upload reads `size` off it.
        file: new File([blob], "voice", { type: storedMime }),
        mime: storedMime,
        durationMs,
        peaks: toWaveformPeaks(amplitudes),
      });
    },
    [release],
  );

  /** Whether the microphone was actually asked for — `false` is a refusal that never reached `requesting`. */
  const start = useCallback(async (): Promise<boolean> => {
    if (sessionRef.current) {
      return true;
    }

    const mime = pickVoiceRecordingMime();

    // WARN: This refusal never enters `requesting`, so nothing downstream can read it off `state` — it is reported through the return value, or the bar stands there over a clock that will never move.
    if (!mime || !navigator.mediaDevices?.getUserMedia) {
      toast.error(REFUSALS.unsupported);

      return false;
    }

    setState("requesting");
    isAbandonedRef.current = false;

    let stream: Nullable<MediaStream> = null;
    // WARN: Minted before the `await`, inside the gesture. WebKit starts an `AudioContext` constructed off a gesture stack `suspended`, and a suspended graph renders nothing through the analyser — every sample reads as silence and the stored waveform is a flat line under audible speech.
    const audio = new AudioContext();

    try {
      // WARN: REQUIREMENTS.md § 13.6. declared the page's session `transient`, which is a *playback* category — capture has to move it and put it back, or the microphone runs under a session sized for a two-second emoticon ping.
      declareAudioSession("play-and-record");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // WARN: The prompt outlives the bar. A 취소 or an unmount during `requesting` finds no recorder to stop, so a permission granted afterwards would open the microphone with no UI left to close it — and `start`'s own guard would then refuse every later attempt until a reload.
      if (isAbandonedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        void audio.close().catch(() => undefined);
        declareRestingAudioSession();
        setState("idle");

        return true;
      }

      // INFO: Belt to the line above — an engine that suspended it anyway resumes here, where the permission has just been granted.
      void audio.resume().catch(() => undefined);
      sessionRef.current = openSession(stream, audio, mime, handleSample, handleFinish);
      isCancelledRef.current = false;
      setElapsedSeconds(0);
      setLevels([]);
      setState("recording");
    } catch (error) {
      stream?.getTracks().forEach((track) => track.stop());
      void audio.close().catch(() => undefined);
      declareRestingAudioSession();
      setState("idle");
      toast.error(toRefusal(error));
    }

    return true;
  }, [handleFinish, handleSample]);

  return { state, elapsedMs: elapsedSeconds * A_SECOND, levels, start, stop, cancel };
}

/**
 * WARN: The duration is wall-clock and is never read back off the container.
 * `MediaRecorder` writes no duration into a WebM at all, and the MP4 it produces
 * yields one only after a decode — while `media.duration_ms` has to be on the row
 * before the § 8.3. estimate can reserve the bubble's box.
 */
function openSession(
  stream: MediaStream,
  audio: AudioContext,
  mime: string,
  onSample: (amplitude: number, elapsedMs: number) => void,
  onFinish: (chunks: Blob[], mime: string, amplitudes: number[], durationMs: number) => void,
): RecordingSession {
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const analyser = audio.createAnalyser();
  const samples = new Uint8Array(FFT_SIZE);
  const amplitudes: number[] = [];
  const chunks: Blob[] = [];
  const startedAt = Date.now();

  analyser.fftSize = FFT_SIZE;
  audio.createMediaStreamSource(stream).connect(analyser);

  const timer = setInterval(() => {
    // WARN: Time domain, not frequency. `getByteFrequencyData` answers a spectrum, whose bins say nothing about how loud the moment was — a waveform is amplitude over time.
    analyser.getByteTimeDomainData(samples);

    const amplitude = toAmplitude(samples);

    amplitudes.push(amplitude);
    onSample(amplitude, Date.now() - startedAt);
  }, VOICE_SAMPLE_INTERVAL);

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      chunks.push(event.data);
    }
  };

  recorder.onstop = () => onFinish(chunks, mime, amplitudes, Date.now() - startedAt);
  recorder.start();

  return { recorder, stream, audio, timer };
}

// INFO: Idempotent — `clearInterval` on an already-cleared handle is a no-op, so `stop`, `cancel` and `closeSession` may each reach it.
function clearSampling(session: Nullable<RecordingSession>): void {
  if (session) {
    clearInterval(session.timer);
  }
}

function closeSession({ stream, audio, timer }: RecordingSession): void {
  clearInterval(timer);
  stream.getTracks().forEach((track) => track.stop());
  void audio.close().catch(() => undefined);
  declareRestingAudioSession();
}

// INFO: RMS rather than the largest sample. One clipped sample paints a full-height bar over a frame of nothing; the root mean square is the window's energy, which is what a listener would call loudness.
function toAmplitude(samples: Uint8Array): number {
  let total = 0;

  for (const sample of samples) {
    // INFO: `getByteTimeDomainData` centres silence on 128, so the deviation from it is the signal.
    const deviation = (sample - 128) / 128;

    total += deviation * deviation;
  }

  return Math.sqrt(total / samples.length);
}

/**
 * INFO: The outcomes are told apart by `DOMException.name`, which is the only thing
 * `getUserMedia` guarantees about a rejection — the message beside it is engine
 * copy and is never shown.
 */
function toRefusal(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";

  if (name === "NotAllowedError" || name === "SecurityError") {
    return REFUSALS.denied;
  }

  return name === "NotFoundError" ? REFUSALS.unsupported : REFUSALS.failed;
}
