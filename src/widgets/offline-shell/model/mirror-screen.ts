import {
  ARCHIVE_FILES_ROUTE,
  ARCHIVE_GALLERY_ROUTE,
  ARCHIVE_ROUTE,
  ARCHIVE_VOICE_ROUTE,
  CALENDAR_ROUTE,
  CHAT_ROUTE,
  SETTINGS_ROUTE,
  type MirroredRoute,
} from "@/shared/config";
import type { Optional } from "@/shared/lib";

/** Which mirrored screen a cached document is standing in for (REQUIREMENTS.md § 16.). */
export type MirrorScreen = "chat" | "calendar" | "gallery" | "files" | "voice" | "settings";

/**
 * WARN: Keyed by `MirroredRoute`, never `string`, so a route added to
 * `MIRRORED_ROUTES` without a screen here fails the build — the same guarantee
 * `TAB_FACES` takes against `TabRoute`. Widened, it is a path the worker serves this
 * document for and this document answers with 인터넷에 연결되어 있지 않아요.
 *
 * INFO: `ARCHIVE_ROUTE` resolves to 갤러리 — it is the one mirrored route with no
 * screen of its own, since the redirect that stands in for it online cannot run here.
 */
const SCREENS: Record<MirroredRoute, MirrorScreen> = {
  [CHAT_ROUTE]: "chat",
  [CALENDAR_ROUTE]: "calendar",
  [ARCHIVE_ROUTE]: "gallery",
  [ARCHIVE_GALLERY_ROUTE]: "gallery",
  [ARCHIVE_FILES_ROUTE]: "files",
  [ARCHIVE_VOICE_ROUTE]: "voice",
  [SETTINGS_ROUTE]: "settings",
};

/**
 * WARN: Called from an effect or behind a hydration gate, never during the first
 * render. This document is prerendered for one path and served at another, so
 * anything URL-derived in that render mismatches.
 *
 * WARN: An exact lookup and never a prefix test, which is what lets 설정 be mirrored
 * while `/settings/devices` and the emoticon screens under it are not.
 */
export function toMirrorScreen(pathname: string): Optional<MirrorScreen> {
  // INFO: `Object.hasOwn`, because the table is a plain object literal — `toMirrorScreen("constructor")` would otherwise answer with an inherited member.
  return Object.hasOwn(SCREENS, pathname) ? SCREENS[pathname as MirroredRoute] : undefined;
}
