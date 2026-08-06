// WARN: One value for both chat gestures on purpose. The reply pull of REQUIREMENTS.md § 8.10. engages at this distance and captures the pointer, after which the bubble stops hearing `pointerup` — so the hold must disarm at exactly the same distance, on the same side of the comparison, or a single move can arm the pull and still open the action sheet 500ms later.
export const GESTURE_SLOP = 8;
