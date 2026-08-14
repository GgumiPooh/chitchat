/**
 * WARN: The `server-only` marker package, stubbed for the scripts in this folder.
 * `tsconfig.scripts.json` points the module here so a CLI can import the same
 * `@/shared/db` and `@/shared/storage` modules a route does — the real package
 * throws on any import outside Next's server runtime, which is the whole of what it
 * does, and a second copy of the storage layer written for scripts alone would be a
 * mirror nobody maintains.
 */
// INFO: A value rather than `export {}`, which the lint rule reads as a trailing re-export. Nothing imports it — the module exists to be resolved, not read.
export const IS_SERVER_ONLY_STUB = true;
