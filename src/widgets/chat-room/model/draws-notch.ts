import type { Maybe } from "@/shared/lib";

/**
 * What the notch is decided from — presence and never identity, so an optimistic
 * send's own drafts answer it beside the echoed row's `ChatMedia`.
 */
export type NotchPayload = {
  media: { voice: Maybe<unknown> }[];
  emoticon: Maybe<unknown>;
  replyTo: Maybe<unknown>;
  isDeleted?: boolean;
  isCollapsed?: boolean;
};

/**
 * DESIGN.md § 6.2. Whether this message has a shape to put the notch corner on.
 * § 6.5.'s attachments and emoticons draw no bubble, so one of those both passes the
 * notch along to the next row that does and breaks the run of bubbles, which is what
 * gives the bubble under it a notch of its own — a quote card stands where that
 * bubble would (§ 6.10.) and a voice card draws its own fill (§ 9.3.).
 *
 * WARN: Answered off the payload alone, where `MessageRow` also resolves a lone
 * inline emoticon (§ 13.) and a link-only card (§ 6.9.) against maps this cannot
 * see — both count as bubbles here and take the notch without drawing one.
 */
export function drawsNotch({
  media,
  emoticon,
  replyTo,
  isDeleted = false,
  isCollapsed = false,
}: NotchPayload): boolean {
  return (
    isDeleted ||
    isCollapsed ||
    Boolean(replyTo) ||
    Boolean(media[0]?.voice) ||
    (media.length === 0 && !emoticon)
  );
}
