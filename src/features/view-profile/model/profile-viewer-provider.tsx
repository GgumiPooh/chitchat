"use client";

import type { Maybe, Nullable, Optional, UserId } from "@/shared/lib";
import { usePathname } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { ProfileOverlay } from "../ui/profile-overlay";

/**
 * Who the § 12.3. screen is drawn for — a participant, resolved live against the
 * chat stream's own set, or an LLM provider (`CLAUDE.md` teammate spec for the
 * assistant reply's own profile), branded through `toLlmProviderBranding`.
 */
export type ProfileSubject =
  | { type: "user"; userId: UserId }
  | { type: "llm"; provider: Maybe<string>; modelId?: Optional<string> };

export type ProfileViewerValue = {
  /** Opens the profile screen for a participant id (REQUIREMENTS.md § 12.3.). */
  openProfile: (userId: UserId) => void;
  /**
   * Opens the profile screen for the AI's own avatar.
   *
   * WARN: `Maybe`, not `Nullable` — the streaming row's `GenerationEntry.provider`
   * is `Optional<string>` and the finished row's `ChatMessage.llmProvider` is
   * `Nullable<string>`, and both wire this same call.
   */
  openLlmProfile: (provider: Maybe<string>, modelId?: Optional<string>) => void;
};

export type ProfileViewerProviderProps = PropsWithChildren<{
  currentUserId: UserId;
}>;

const ProfileViewerContext = createContext<Nullable<ProfileViewerValue>>(null);

/**
 * Owns the one profile screen (REQUIREMENTS.md § 12.3.), so every avatar in the app
 * opens the same overlay.
 *
 * WARN: It lives in the shell for `ChatStreamProvider`'s reason (§ 8.4.) and one of
 * its own. An avatar is rendered by `widgets/chat-room`, by the Settings screen and
 * by the calendar's day agenda, and a widget may not import a sibling widget (§ 2.) —
 * so an overlay mounted beside any one of them would have to be mounted beside all
 * of them, with a copy of this state per screen and two of them able to be open at
 * once.
 *
 * WARN: `Avatar` itself does not reach this hook and must not. It is `shared/ui`
 * (§ 2.), which sits below every layer this reads from — so the tap is wired by
 * whoever renders the avatar, and the calendar's day agenda deliberately wires none
 * (§ 12.).
 */
export function ProfileViewerProvider({ children, currentUserId }: ProfileViewerProviderProps) {
  const pathname = usePathname();
  const [subject, setSubject] = useState<Nullable<ProfileSubject>>(null);
  const openProfile = useCallback((userId: UserId) => setSubject({ type: "user", userId }), []);
  const openLlmProfile = useCallback(
    (provider: Maybe<string>, modelId?: Optional<string>) =>
      setSubject({ type: "llm", provider, modelId }),
    [],
  );
  // WARN: Stable, like `openProfile` beside it. `ProfileOverlay` lists it in the deps of both its effects — one of which registers a document-level `keydown` listener and one of which can call it — so a fresh arrow per render re-subscribes on every provider render for nothing.
  const closeProfile = useCallback(() => setSubject(null), []);

  const [prevPathname, setPrevPathname] = useState(pathname);
  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    setSubject(null);
  }

  const value = useMemo(() => ({ openProfile, openLlmProfile }), [openProfile, openLlmProfile]);

  return (
    <ProfileViewerContext.Provider value={value}>
      {children}
      {subject && (
        <ProfileOverlay subject={subject} currentUserId={currentUserId} onClose={closeProfile} />
      )}
    </ProfileViewerContext.Provider>
  );
}

/**
 * WARN: Throws outside the provider rather than answering a no-op. An avatar whose
 * tap silently does nothing is indistinguishable from one that is not meant to open
 * a profile, and the calendar's day agenda is exactly that case (§ 12.) — so the two
 * must not be able to look the same.
 */
export function useProfileViewer(): ProfileViewerValue {
  const value = useContext(ProfileViewerContext);

  if (!value) {
    throw new Error("useProfileViewer must be used inside ProfileViewerProvider");
  }

  return value;
}
