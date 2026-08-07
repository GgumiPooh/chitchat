// INFO: `navigator.audioSession` is Safari 16.4+ and shipped nowhere else, so it is read off a widened `Navigator` rather than waiting on the DOM lib.
type AudioSessionNavigator = Navigator & {
  audioSession?: { type: string };
};

/** The categories the Audio Session API defines. */
export type AudioSessionType =
  "auto" | "playback" | "transient" | "transient-solo" | "ambient" | "play-and-record";

/**
 * REQUIREMENTS.md § 13.6. The category the page sits in whenever it is not
 * capturing — the notification category, so nothing this app plays mints an iOS
 * Now Playing entry and other audio ducks instead of stopping.
 *
 * WARN: The **one** place the resting category is written down. Anything that
 * moves the session for the length of an operation comes back through
 * `declareRestingAudioSession`, never by naming a category of its own — otherwise
 * revisiting this decision silently leaves one caller behind.
 *
 * INFO: A voice message is minutes rather than the two seconds § 13.6. was written for, and `playback` was weighed for it and **rejected**: the session is page-wide, so it would put every emoticon ping on the lock screen as Now Playing — the exact regression § 13.6. removed — and `playback` stops the user's music where `transient` only ducks it. The cost accepted in exchange is that voice playback gets no lock-screen transport and no guaranteed background playback.
 */
const RESTING_TYPE: AudioSessionType = "transient";

/**
 * Moves the page into `type` for as long as an operation needs it — capture wants
 * `play-and-record`, and nothing else in the app moves it at all.
 *
 * WARN: The session is a property of the **page**, not of an element, so every
 * `Audio` this app mints shares whatever was declared last. There is no
 * arrangement in which one element is `transient` and another is not, and a caller
 * that moves it owes the page a `declareRestingAudioSession` on every exit path.
 */
export function declareAudioSession(type: AudioSessionType): void {
  const session = (navigator as AudioSessionNavigator).audioSession;

  if (session) {
    session.type = type;
  }
}

/**
 * Puts the page back in the resting category — both what a capture restores to and
 * what a fresh player is minted under.
 *
 * WARN: Call before `new Audio()` — WebKit fixes an element's category from its
 * first playback, and the `auto` an `<audio>` element settles into is `playback`.
 */
export function declareRestingAudioSession(): void {
  declareAudioSession(RESTING_TYPE);
}
