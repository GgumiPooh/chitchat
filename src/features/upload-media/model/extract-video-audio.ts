import type { Nullable } from "@/shared/lib";
import {
  BlobSource,
  BufferTarget,
  Conversion,
  EncodedAudioPacketSource,
  Input,
  MP4,
  Mp4OutputFormat,
  Output,
  QTFF,
  WEBM,
} from "mediabunny";
import { pumpAacPackets, type TrimRange } from "./trim-video";

const EXTRACTED_MIME = "audio/mp4";

// INFO: `trimVideo`'s list and its bundle argument, unchanged — a demuxer per container, tree-shaken to `ALLOWED_VIDEO_MIMES`.
const INPUT_FORMATS = [MP4, QTFF, WEBM];

/**
 * REQUIREMENTS.md § 13.4.1. The sound under a trimmed range, as the emoticon's
 * audio slot takes it.
 *
 * INFO: Answers `null` rather than throwing for every reason a clip may have no
 * usable sound — no track, an engine that cannot re-encode one (Safari's audio
 * WebCodecs landed only in 26), a container this build cannot demux. The sound is
 * an offer here, so a failure leaves the emoticon silent rather than unmade.
 *
 * WARN: Run against the **source**, not against `trimVideo`'s output — that one
 * discards the audio track outright, and for a reason it states.
 *
 * WARN: `codec: "aac"` keeps `mediabunny` on the packet-copy fast path at `start === 0`
 * while stopping a `start > 0` transcode from falling back to `pcm-s16` (`ipcm`) or
 * `opus`. Where the engine has no AAC `AudioEncoder`, `pumpAacPackets` copies the
 * source's AAC packets across `[start, end)` directly.
 */
export async function extractVideoAudio(file: File, range: TrimRange): Promise<Nullable<File>> {
  try {
    const input = new Input({ source: new BlobSource(file), formats: INPUT_FORMATS });
    const audioTrack = await input.getPrimaryAudioTrack();

    if (!audioTrack) {
      return null;
    }

    const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: { codec: "aac" },
      trim: { start: range.start, end: range.end },
    });

    if (conversion.isValid) {
      await conversion.execute();

      const buffer = output.target.buffer;

      return buffer ? new File([buffer], toAudioName(file.name), { type: EXTRACTED_MIME }) : null;
    }

    if ((await audioTrack.getCodec()) !== "aac") {
      return null;
    }

    const packetOutput = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
    const audioSource = new EncodedAudioPacketSource("aac");

    packetOutput.addAudioTrack(audioSource);
    await packetOutput.start();
    await pumpAacPackets(audioTrack, audioSource, range);
    await packetOutput.finalize();

    const packetBuffer = packetOutput.target.buffer;

    return packetBuffer
      ? new File([packetBuffer], toAudioName(file.name), { type: EXTRACTED_MIME })
      : null;
  } catch {
    return null;
  }
}

function toAudioName(name: string): string {
  return `${name.replace(/\.[^.]+$/, "")}.m4a`;
}
