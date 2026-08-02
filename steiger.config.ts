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
    // WARN: Entity consumers are mostly Route Handlers under `app/`, which steiger does not scan, so its reference count is always short.
    files: ["./src/entities/**"],
    rules: {
      "fsd/insignificant-slice": "warn",
    },
  },
]);
