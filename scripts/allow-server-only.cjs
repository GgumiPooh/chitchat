/**
 * Lets a one-shot script import the app's `server-only` modules.
 *
 * INFO: `server-only` throws on import unless the loader resolves it under React's
 * `react-server` condition. A script legitimately *is* the server, so the marker has
 * nothing to protect here — it exists to keep those modules out of a **browser** bundle.
 *
 * WARN: `--conditions=react-server` is the tidier-looking fix and does not work. It also
 * swaps React itself for the server build, and `@/shared/lib`'s barrel reaches `@dnd-kit`
 * through `use-sortable-sensors` — which calls `createContext` at module scope and is not
 * in that build. Stubbing the one marker package leaves every other resolution alone.
 *
 * WARN: `scripts/` only. Nothing here may be reachable from `src/`, or the marker stops
 * marking anything.
 */
// WARN: `Module._load` and not a `require.cache` entry. tsx installs its own transformer and re-requires the marker through a path the preloaded cache key does not match, so seeding the cache looks right and changes nothing.
const Module = require("node:module");
const load = Module._load;

Module._load = function (request, parent, isMain) {
  return request === "server-only" ? {} : load.call(this, request, parent, isMain);
};
