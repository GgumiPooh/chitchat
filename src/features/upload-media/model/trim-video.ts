import type { Nullable } from "@/shared/lib";
import {
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  EncodedPacketSink,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
  type InputAudioTrack,
} from "mediabunny";

// INFO: REQUIREMENTS.md § 12.1. The trimmer always writes MP4, whatever the source container was — it is the one thing every browser the app runs in can play back.
const TRIMMED_MIME = "video/mp4";

/**
 * WARN: Named one by one rather than `ALL_FORMATS`, and that is a bundle decision.
 * `mediabunny` ships a demuxer per container and tree-shakes to whatever this list
 * names — `ALL_FORMATS` pulls in every one of them, including the audio-only
 * containers this app never sees.
 *
 * INFO: Exactly `ALLOWED_VIDEO_MIMES` (`shared/config`): MP4, QuickTime (the `.mov`
 * an iPhone produces) and WebM. A format missing here is refused by `validateFile`
 * long before it reaches the trimmer.
 */
const INPUT_FORMATS = [MP4, QTFF, WEBM];

export type TrimOptions = {
  /** Whether the source's sound rides along with the cut, where the browser can carry it. */
  keepsAudio?: boolean;
};

export type TrimRange = {
  /** Seconds from the start of the source. */
  start: number;
  end: number;
};

/**
 * Cuts `range` out of a video, in the browser, and answers the result as a `File`
 * ready for the § 9. upload pipeline.
 *
 * INFO: REQUIREMENTS.md § 12.1. `mediabunny` copies the encoded samples straight
 * across whenever the source codec already fits the output container, so an iPhone
 * clip is re-muxed rather than re-encoded — no generation loss and no long wait.
 *
 * WARN: The audio track is discarded unless the caller asks for it, and that is not
 * only a size decision. A background plays `muted` (nothing else autoplays on iOS),
 * so the track would never be heard — and dropping it means the whole operation needs
 * only WebCodecs' **video** interfaces, which Safari has had since 16.4. The audio
 * interfaces landed in Safari 26, so keeping the track unconditionally would raise
 * the app's floor by ten major versions to ship silence.
 *
 * INFO: § 9. and § 13.4.1. pass `keepsAudio`, because an attachment and an emoticon
 * are played aloud — and it falls back to a silent trim rather than failing, since a
 * browser that cannot carry the track is exactly the one the paragraph above describes.
 */
export async function trimVideo(
  file: File,
  range: TrimRange,
  { keepsAudio = false }: TrimOptions = {},
): Promise<File> {
  if (keepsAudio) {
    const kept = await convert(file, range, false);

    if (kept) {
      return kept;
    }
  }

  const trimmed = await convert(file, range, true);

  // INFO: A source whose video track this browser cannot decode at all. It is reported rather than thrown as an opaque failure, because the caller's copy has to tell it apart from a network error.
  if (!trimmed) {
    throw new Error("video track cannot be converted");
  }

  return trimmed;
}

/**
 * INFO: Answers `null` for a conversion this browser cannot perform, which is what
 * lets `keepsAudio` retry without the track rather than report the clip unusable.
 *
 * WARN: Naming `codec: "aac"` keeps `mediabunny` on the packet-copy fast path at
 * `start === 0` while stopping a `start > 0` transcode from falling back to `pcm-s16`
 * (`ipcm`) or `opus`, which WebKit's MP4 player does not play. Where the engine has no
 * AAC `AudioEncoder` (Safari < 26, Linux Chromium), `mediabunny` discards the track and
 * `copyWithAacPackets` muxes the source's AAC packets across `[start, end)` directly.
 */
async function convert(
  file: File,
  range: TrimRange,
  discardsAudio: boolean,
): Promise<Nullable<File>> {
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input: new Input({ source: new BlobSource(file), formats: INPUT_FORMATS }),
    output,
    audio: discardsAudio ? { discard: true } : { codec: "aac" },
    trim: { start: range.start, end: range.end },
  });

  if (!discardsAudio && conversion.discardedTracks.some((item) => item.track.isAudioTrack())) {
    return copyWithAacPackets(file, range);
  }

  if (!conversion.isValid) {
    return null;
  }

  await conversion.execute();

  const buffer = output.target.buffer;

  if (!buffer) {
    throw new Error("conversion produced no output");
  }

  return new File([buffer], toTrimmedName(file.name), { type: TRIMMED_MIME });
}

async function copyWithAacPackets(file: File, range: TrimRange): Promise<Nullable<File>> {
  const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });
  const audioTrack = await input.getPrimaryAudioTrack();

  if (!audioTrack || (await audioTrack.getCodec()) !== "aac") {
    return null;
  }

  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const conversion = await Conversion.init({
    input,
    output,
    composable: true,
    audio: { discard: true },
    trim: { start: range.start, end: range.end },
  });

  if (conversion.utilizedTracks.length === 0) {
    return null;
  }

  const audioSource = new EncodedAudioPacketSource("aac");

  output.addAudioTrack(audioSource);
  await output.start();
  await Promise.all([conversion.execute(), pumpAacPackets(audioTrack, audioSource, range)]);
  await output.finalize();

  const buffer = output.target.buffer;

  return buffer ? new File([buffer], toTrimmedName(file.name), { type: TRIMMED_MIME }) : null;
}

/** Copies encoded AAC packets overlapping `range` into `source` without `AudioDecoder` or `AudioEncoder`. */
export async function pumpAacPackets(
  track: InputAudioTrack,
  source: EncodedAudioPacketSource,
  range: TrimRange,
): Promise<void> {
  const sink = new EncodedPacketSink(track);
  const decoderConfig = await track.getDecoderConfig();
  const meta = { decoderConfig: decoderConfig ?? undefined };
  const startPacket = (await sink.getKeyPacket(range.start)) ?? (await sink.getFirstKeyPacket());
  let offset: Nullable<number> = null;

  if (startPacket) {
    for await (const packet of sink.packets(startPacket)) {
      if (packet.timestamp >= range.end) {
        break;
      }

      if (packet.timestamp + packet.duration <= range.start) {
        continue;
      }

      offset ??= Math.min(range.start, packet.timestamp);
      await source.add(packet.clone({ timestamp: packet.timestamp - offset }), meta);
    }
  }

  source.close();
}

/** Whether this clip is already inside `maxDurationMs` and needs no trim at all. */
export function isWithinDuration(durationMs: number, maxDurationMs: number): boolean {
  return durationMs <= maxDurationMs;
}

function toTrimmedName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.mp4`;
}
