import fsd from "@feature-sliced/steiger-plugin";
import { defineConfig } from "steiger";

export default defineConfig([
  ...fsd.configs.recommended,
  {
    files: ["./src/widgets/**"],
    rules: {
      "fsd/insignificant-slice": "warn",
    },
  },
  {
    // WARN: A feature of a two-person app legitimately has one consumer — `send-message` is used by the chat room and nothing else, and merging it into that widget would violate the layer split in REQUIREMENTS.md § 2.
    // WARN: `excessive-slicing`'s threshold is a suggestion to group related slices, not a cap — this app's features are already named narrowly by the one thing each does, and forcing them under grouping folders would trade that legibility for a number.
    files: ["./src/features/**"],
    rules: {
      "fsd/insignificant-slice": "warn",
      "fsd/excessive-slicing": "warn",
    },
  },
  {
    // WARN: Entity consumers are mostly Route Handlers under `app/`, which steiger does not scan, so its reference count is always short.
    files: ["./src/entities/**"],
    rules: {
      "fsd/insignificant-slice": "warn",
    },
  },
]);
