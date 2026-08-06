import { cn, splitTextByQuery } from "@/shared/lib";
import { Fragment } from "react";

export type SearchHighlightProps = {
  className?: string;
  markClassName?: string;
  text: string;
  query: string;
};

/**
 * The matched substring, lit in `search-hit` (DESIGN.md § 6.8.).
 *
 * WARN: Split on the client, never `ts_headline`. The server answers with the
 * message's own text so the same string can be measured, clamped and
 * re-highlighted without a round trip — and a database-composed fragment would
 * carry markup this component would then have to trust.
 */
export function SearchHighlight({ className, markClassName, text, query }: SearchHighlightProps) {
  return (
    <span className={className}>
      {splitTextByQuery(text, query).map((segment, index) => (
        <Fragment key={index}>
          {segment.isMatch ? (
            <mark className={cn("rounded-xs bg-search-hit text-ink", markClassName)}>
              {segment.value}
            </mark>
          ) : (
            segment.value
          )}
        </Fragment>
      ))}
    </span>
  );
}
