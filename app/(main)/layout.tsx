import { readChatBackground } from "@/entities/chat-background";
import { hasEventToday } from "@/entities/event";
import { readLlmSystemPrompt } from "@/entities/llm-system-prompt";
import { countUnreadMessages } from "@/entities/message";
import { listUsers } from "@/entities/user";
import { PinLockGate } from "@/features/pin-lock";
import {
  encryptServerPayload,
  ensureSessionEncryptionKey,
  getServerEcdhPublicKey,
  requireSessionOrRedirect,
} from "@/shared/auth";
import {
  ARCHIVE_COLUMNS_COOKIE_NAME,
  GEEKNEWS_SUBSCRIPTION_COOKIE_NAME,
  NOTIFY_MODE_COOKIE_NAME,
  notifyModes,
  PUSH_STATE_COOKIE_NAME,
  SIDE_PANEL_COOKIE_NAME,
  VOCA_REMINDER_COOKIE_NAME,
} from "@/shared/config";
import { cookies } from "next/headers";
import { type PropsWithChildren } from "react";
import { SyncedStorageProvider } from "synced-storage/react";
import { MainShell } from "./main-shell";

// INFO: The proxy only saw that a cookie exists (REQUIREMENTS.md § 5.2.); this is the real check, and it covers every screen below.
// WARN: REQUIREMENTS.md § 1.1. This layout **blocks**, and that is the decision rather than an omission. Behind a `<Suspense>` the first HTML carries no session, so § 12.2.'s wallpaper and the chrome tint it seeds arrive a frame after the room has already painted flat.
export default async function MainLayout({ children }: PropsWithChildren) {
  const { user, session } = await requireSessionOrRedirect();
  const sessionKey = ensureSessionEncryptionKey(session);
  const serverPublicKey = getServerEcdhPublicKey(sessionKey);

  // INFO: REQUIREMENTS.md § 8.4.2. Both seed the shell's state, which outlives the chat screen the socket itself is scoped to.
  // INFO: REQUIREMENTS.md § 11.5. The calendar dot rides the same render — it is conversation-wide, so it needs no per-user query.
  // INFO: REQUIREMENTS.md § 12.2. The wallpaper is seeded here rather than by the chat screen, because the state it feeds is refreshed by a `user_changed` event that reaches every tab.
  const [participants, unreadCount, hasTodayEvent, chatBackground, llmSystemPrompt, cookieStore] =
    await Promise.all([
      listUsers(),
      countUnreadMessages(user.id),
      hasEventToday(),
      readChatBackground(),
      readLlmSystemPrompt(),
      cookies(),
    ]);

  // WARN: Only these cross to the client. `ssrCookies` is serialized into the RSC payload, and `getAll()` would put the `httpOnly` session cookie in it.
  // WARN: `jandh:side-panel` is dropped unless it is the JSON boolean it now holds — a browser still carrying the old `open`/`closed` word would make `SyncedStorageProvider`'s `JSON.parse` warn on every request until the next toggle.
  // WARN: `jandh:notify-mode` is dropped unless it is one of `notifyModes`' own JSON-stringified indices — `toNotifyModeIndex`'s own WARN explains why the cookie carries a number rather than the `NotifyMode` string the old `jandh:silent-send` boolean's replacement would otherwise have been.
  const ssrCookies = cookieStore
    .getAll()
    .filter(
      ({ name, value }) =>
        name === PUSH_STATE_COOKIE_NAME ||
        name === ARCHIVE_COLUMNS_COOKIE_NAME ||
        (name === GEEKNEWS_SUBSCRIPTION_COOKIE_NAME && (value === "true" || value === "false")) ||
        (name === VOCA_REMINDER_COOKIE_NAME && (value === "true" || value === "false")) ||
        (name === SIDE_PANEL_COOKIE_NAME && (value === "true" || value === "false")) ||
        (name === NOTIFY_MODE_COOKIE_NAME &&
          notifyModes.some((_, index) => value === JSON.stringify(index))),
    );

  // INFO: AGENTS.md § 4.4. Painted on `#app-shell` rather than `<html>` — the root layout has no cookie access here — so `theme.css`'s `:root:has(#app-shell[data-side-panel="closed"])` collapses `--pane-width` before hydration.
  const isSidePanelClosed = cookieStore.get(SIDE_PANEL_COOKIE_NAME)?.value === "false";

  const encryptedShell = await encryptServerPayload({
    participants,
    unreadCount,
    hasTodayEvent,
    chatBackgroundMediaId: chatBackground?.mediaId ?? null,
    chatBackgroundBlurhash: chatBackground?.blurhash ?? null,
    llmSystemPrompt,
    shareKey: user.shareKey,
  });

  return (
    // INFO: REQUIREMENTS.md § 16.1. A second `SyncedStorageProvider` under `GlobalProvider`'s, because this group is already dynamic and the root one also covers `/offline`, which must stay static.
    <SyncedStorageProvider ssrCookies={ssrCookies}>
      <PinLockGate
        hasPinSet={user.pinHash !== null}
        initialLockedUntil={user.pinLockedUntil?.toISOString() ?? null}
        serverPublicKey={serverPublicKey}
      >
        <MainShell
          currentUserId={user.id}
          encryptedShell={encryptedShell}
          isSidePanelClosed={isSidePanelClosed}
        >
          {children}
        </MainShell>
      </PinLockGate>
    </SyncedStorageProvider>
  );
}
