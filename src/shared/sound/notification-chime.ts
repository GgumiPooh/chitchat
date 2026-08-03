import { safelyGet, safelyRun, type Nullable } from "@/shared/lib";

// INFO: A rising two-note ping. Synthesized rather than shipped as a file so there is no binary to keep in the repository and nothing to download before the first message can be heard.
const NOTES = [
  { frequency: 880, startAt: 0 },
  { frequency: 1320, startAt: 0.09 },
];

const NOTE_DURATION = 0.22;

const PEAK_GAIN = 0.14;

// WARN: A context created before a user gesture starts `suspended` on every browser. Creating it lazily inside `unlock` — which only ever runs from a real gesture — is what makes the first chime audible.
let context: Nullable<AudioContext> = null;

/**
 * Opens the audio context from inside a user gesture, so a later chime is allowed
 * to play. Safe to call repeatedly, and it has to be called repeatedly: iOS
 * interrupts the context when the PWA is backgrounded and never resumes it on its
 * own, so every gesture is a chance to bring it back.
 */
export function unlockNotificationChime(): void {
  context ??= safelyGet(() => new AudioContext()) ?? null;

  // WARN: Not `=== "suspended"`. WebKit parks an interrupted context in its own `interrupted` state, and only `resume()` moves either one back to `running`.
  if (context && context.state !== "running") {
    safelyRun(() => void context?.resume());
  }
}

/** Plays the incoming-message ping. A no-op until `unlockNotificationChime` has run. */
export function playNotificationChime(): void {
  const audio = context;

  if (!audio || audio.state !== "running") {
    return;
  }

  safelyRun(() => {
    for (const { frequency, startAt } of NOTES) {
      const startedAt = audio.currentTime + startAt;
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.type = "sine";
      oscillator.frequency.value = frequency;
      // INFO: A ramp, not a step — an abrupt gain change on a sine is a click, and the click is louder than the note.
      gain.gain.setValueAtTime(0, startedAt);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, startedAt + NOTE_DURATION / 8);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + NOTE_DURATION);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(startedAt);
      oscillator.stop(startedAt + NOTE_DURATION);
    }
  });
}
