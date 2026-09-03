"use client";

import type { CalendarSummary } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { useChatStream } from "@/features/chat-stream";
import { useProfileViewer } from "@/features/view-profile";
import { toMediaUrl } from "@/shared/config";
import { cn, formatDate, type Maybe, type Nullable, type UserId } from "@/shared/lib";
import { Avatar, HapticTarget, PreloadImage } from "@/shared/ui";
import { Heart } from "lucide-react";

export type DDayHeroProps = {
  className?: string;
  summary: CalendarSummary;
};

/**
 * DESIGN.md § 7.9. The screen's single focal point, and the only place `display-xl`
 * appears in the app.
 *
 * INFO: Every number here is resolved on the server (REQUIREMENTS.md § 11.1.), so
 * a device with a skewed clock cannot show the two users different counts.
 */
export function DDayHero({ className, summary }: DDayHeroProps) {
  const { chatBackgroundMediaId, chatBackgroundBlurhash, participants } = useChatStream();
  const first = resolveParticipant(participants, summary.firstUserId, 0);
  const second = resolveParticipant(participants, summary.secondUserId, 1);

  return (
    <section
      className={cn("relative isolate flex flex-col overflow-hidden", className)}
      aria-label="함께한 날"
    >
      {chatBackgroundMediaId ? (
        <PreloadImage
          className="absolute inset-0 -z-10"
          imgClassName="size-full object-cover"
          placeholderClassName="bg-primary"
          src={toMediaUrl(chatBackgroundMediaId, "original")}
          blurhash={chatBackgroundBlurhash}
          hasSkeleton={false}
          alt=""
        />
      ) : (
        <div className="absolute inset-0 -z-10 bg-primary" />
      )}
      {/* WARN: DESIGN.md § 7.16. The chat wallpaper's own wash, at the 20% `ChatBackdrop` and `toChromeTint` carry — the calendar borrows the room's photo and must borrow its tone with it. */}
      <div className="absolute inset-0 -z-10 bg-chat-scrim/20" />

      <div className="flex flex-1 flex-col items-center justify-center gap-xs px-lg text-center text-on-scrim">
        <p className="text-title-md">함께한 지</p>
        <p className="text-display-xl">{summary.dayCount.toLocaleString()}</p>
        <div>
          <p className="text-body-lg">{formatDate(summary.startDate)}</p>
          {summary.nextMilestone && (
            <p className="text-body-md">
              {summary.nextMilestone.label}까지 {summary.nextMilestone.daysLeft}일
            </p>
          )}
        </div>
      </div>

      {/* INFO: DESIGN.md § 3.4. `--bottom-inset` is the tab bar's height — the hero is the one screen whose bottom edge sits under it rather than above `RouteTransition`'s trailing space. */}
      <div className="flex items-end justify-center gap-xl pb-[calc(var(--bottom-inset,0px)+var(--spacing-xl))]">
        <PersonBadge participant={first} />
        <Heart className="mb-xs size-8 fill-hero-heart stroke-hero-outline" strokeWidth={1} />
        <PersonBadge participant={second} />
      </div>
    </section>
  );
}

type PersonBadgeProps = {
  className?: string;
  participant: Maybe<Participant>;
};

// INFO: REQUIREMENTS.md § 12.3. Opens the profile screen, as the chat panel's partner block does — `onClick` rather than `canEnlarge`, since one avatar can only do one of the two.
function PersonBadge({ className, participant }: PersonBadgeProps) {
  const { openProfile } = useProfileViewer();

  if (!participant) {
    return null;
  }

  return (
    <div className={cn("flex flex-col items-center gap-2xs", className)}>
      {/* INFO: A border, not a ring — `Avatar`'s own ring is inset and the photo paints over it, so a ring here never shows. */}
      {/* INFO: `Avatar` becomes a `<button>` with `onClick` and carries no `haptic` of its own, so the overlay is mounted beside it here (DESIGN.md § 7.15.). */}
      <HapticTarget className="inline-flex shrink-0">
        <Avatar
          className="border-2 border-hero-outline"
          size="profile"
          name={participant.name}
          mediaId={participant.avatarMediaId}
          onClick={() => openProfile(participant.id)}
        />
      </HapticTarget>
      <p className="text-title-sm text-on-scrim">{participant.name}</p>
    </div>
  );
}

// INFO: Falls back to the participants' own order when an id is missing or stale — a fresh couple has no `couple_settings` row yet to name one.
function resolveParticipant(
  participants: Participant[],
  id: Nullable<UserId>,
  fallbackIndex: number,
): Maybe<Participant> {
  return participants.find((participant) => participant.id === id) ?? participants[fallbackIndex];
}
