"use client";

import type { CalendarSummary } from "@/entities/event";
import type { Participant } from "@/entities/user";
import { useChatStream } from "@/features/chat-stream";
import { toMediaUrl } from "@/shared/config";
import { cn, formatDate, type Maybe, type Nullable, type UserId } from "@/shared/lib";
import { Avatar, PreloadImage } from "@/shared/ui";
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
      {/* INFO: Heavier toward the bottom, where the avatars and their names sit on the photo directly. */}
      {/* WARN: The top stop is `toHeroTint`'s wash, and the two move together (DESIGN.md § 3.3.). */}
      <div className="absolute inset-0 -z-10 bg-linear-to-b from-hero-scrim/30 via-hero-scrim/20 to-hero-scrim/75" />

      <div className="flex flex-1 flex-col items-center justify-center gap-xs px-lg text-center text-on-scrim">
        <p className="text-title-md">함께한 지</p>
        <p className="text-display-xl">{summary.dayCount.toLocaleString()}</p>
        <p className="text-body-lg">{formatDate(summary.startDate)}</p>
        {summary.nextMilestone && (
          <p className="pt-2xs text-body-md">
            {summary.nextMilestone.label}까지 {summary.nextMilestone.daysLeft}일
          </p>
        )}
      </div>

      {/* INFO: DESIGN.md § 3.4. `--bottom-inset` is the tab bar's height — the hero is the one screen whose bottom edge sits under it rather than above `RouteTransition`'s trailing space. */}
      <div className="flex items-end justify-center gap-xl pb-[calc(var(--bottom-inset,0px)+var(--spacing-xl))]">
        <PersonBadge participant={first} />
        <Heart
          className="mb-xs size-8 fill-hero-heart stroke-hero-scrim drop-shadow-sm"
          strokeWidth={1.25}
        />
        <PersonBadge participant={second} />
      </div>
    </section>
  );
}

type PersonBadgeProps = {
  className?: string;
  participant: Maybe<Participant>;
};

// WARN: DESIGN.md § 7.11. Not `canEnlarge` and not wired to the profile screen — the avatar here is a photo of who this is, not a control.
function PersonBadge({ className, participant }: PersonBadgeProps) {
  if (!participant) {
    return null;
  }

  return (
    <div className={cn("flex flex-col items-center gap-2xs", className)}>
      <Avatar
        className="ring-2 ring-on-scrim"
        size="profile"
        name={participant.name}
        mediaId={participant.avatarMediaId}
      />
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
