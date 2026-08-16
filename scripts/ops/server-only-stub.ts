/**
 * Stands in for the `server-only` package when a script in this directory runs.
 *
 * WARN: Wired up by `tsconfig.ops.json` and by nothing else, so the real guard still holds
 * everywhere Next builds. These scripts ARE the server — they run in plain Node with no
 * client bundle to leak into — but the marker package cannot know that and throws on sight.
 *
 * INFO: Its own `react-server` export condition would also neutralize it, and is deliberately
 * not used: that condition swaps React for its server build, and `@/shared/lib` re-exports a
 * `@dnd-kit` hook, so every server module reaching that barrel would die on `createContext`.
 */
export const SERVER_ONLY_STUB = true;
