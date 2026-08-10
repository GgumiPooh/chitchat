"use client";

import type { Nullable } from "@/shared/lib";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { ProfileOverlay } from "../ui/profile-overlay";

export type ProfileViewerValue = {
  /** Opens the profile screen for a participant id (REQUIREMENTS.md § 12.3.). */
  openProfile: (userId: string) => void;
};

export type ProfileViewerProviderProps = PropsWithChildren<{
  currentUserId: string;
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
  const [openUserId, setOpenUserId] = useState<Nullable<string>>(null);
  const openProfile = useCallback((userId: string) => setOpenUserId(userId), []);
  // WARN: Stable, like `openProfile` beside it. `ProfileOverlay` lists it in the deps of both its effects — one of which registers a document-level `keydown` listener and one of which can call it — so a fresh arrow per render re-subscribes on every provider render for nothing.
  const closeProfile = useCallback(() => setOpenUserId(null), []);
  const value = useMemo(() => ({ openProfile }), [openProfile]);

  return (
    <ProfileViewerContext.Provider value={value}>
      {children}
      {openUserId && (
        <ProfileOverlay userId={openUserId} currentUserId={currentUserId} onClose={closeProfile} />
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
