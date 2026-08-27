import { cn } from "@/shared/lib";
import Markdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import remarkGfm from "remark-gfm";

export type MarkdownBodyProps = {
  className?: string;
  text: string;
  /** REQUIREMENTS.md § 16.1. 나에게만 보내기 — uses inverted private tokens (surface-soft-private, primary-private, bubble-private-ink). */
  isOnlyMe?: boolean;
};

/**
 * WARN: `remarkGfm` first. `remark-cjk-friendly-gfm-strikethrough`'s own README states it does nothing placed ahead of GFM — it patches GFM's `~~` construct — and `remark-cjk-friendly` documents the same order for its emphasis fix.
 *
 * WARN: REQUIREMENTS.md § 8.3. Exported because the row estimate parses the same text through the same list. Fed from two sources the estimate and the bubble disagree about the block structure by construction.
 */
export const MARKDOWN_PLUGINS = [remarkGfm, remarkCjkFriendly, remarkCjkFriendlyGfmStrikethrough];

const BASE_MARKDOWN_CLASS_NAME = cn(
  // WARN: DESIGN.md § 4.2.3. `word-break: normal` exactly as the § 6.2. bubble opts into it — the app-wide `keep-all` this inherited otherwise made the AI answer the one bubble in the column that pushed a whole 어절 down, and REQUIREMENTS.md § 8.3.'s measurer models `normal` and takes no option for the other.
  "space-y-2xs text-chat-body [word-break:normal]",
  "[&_p]:[overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap",
  // INFO: DESIGN.md § 6.11. Three steps and no more — preflight resets every heading to the body's own size, and a bubble this narrow has room to say "heading" three ways before the smallest one lands under `chat-body` itself.
  "[&_:is(h3,h4,h5,h6)]:font-semibold [&_h1]:text-display-sm [&_h2]:text-title-md",
  // WARN: `!` because `space-y-2xs` on the wrapper writes the same `margin-top` at a specificity these arbitrary variants do not clear.
  "[&_:is(h1,h2,h3,h4,h5,h6)]:mt-xs! [&_:is(h1,h2,h3,h4,h5,h6):first-child]:mt-0!",
  "[&_ol]:list-decimal [&_ol]:space-y-2xs [&_ol]:pl-md [&_ul]:list-disc [&_ul]:space-y-2xs [&_ul]:pl-md",
  "[&_code]:rounded-xs [&_code]:px-2xs [&_code]:py-px",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:p-sm",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  // WARN: REQUIREMENTS.md § 8.3. `table-fixed`, and it is the estimate that asks for it — `auto` leaves the split of a table's width across its columns to the UA, and Blink and WebKit answer differently enough to be tens of pixels of § 8.3. drift on the same answer. Equal columns are the same in both.
  "[&_table]:w-full [&_table]:table-fixed [&_table]:border-collapse [&_table]:text-left",
  "[&_th]:border-b [&_th]:px-sm [&_th]:py-2xs [&_th]:font-semibold",
  "[&_td]:border-b [&_td]:px-sm [&_td]:py-2xs",
);

const THEME_STANDARD_CLASS_NAME = cn(
  "text-bubble-ink",
  // WARN: `border-hairline` is what tames it rather than what draws it — preflight already gives `hr` a 1px top border in `currentColor`, which inside a bubble is `bubble-ink` at full strength.
  "[&_hr]:my-xs! [&_hr]:border-t [&_hr]:border-hairline",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary-hover",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-sm [&_blockquote]:text-meta",
  "[&_code]:border [&_code]:border-hairline [&_code]:bg-surface-soft",
  "[&_pre]:border [&_pre]:border-hairline [&_pre]:bg-surface-soft",
  "[&_th]:border-hairline",
  "[&_td]:border-hairline",
);

const THEME_ONLY_ME_CLASS_NAME = cn(
  "text-bubble-private-ink",
  "[&_hr]:my-xs! [&_hr]:border-t [&_hr]:border-current/15",
  "[&_a]:text-primary-private [&_a]:underline [&_a]:underline-offset-2",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-current/25 [&_blockquote]:pl-sm [&_blockquote]:text-bubble-private-ink/75",
  "[&_code]:border [&_code]:border-current/15 [&_code]:bg-surface-soft-private",
  "[&_pre]:border [&_pre]:border-current/15 [&_pre]:bg-surface-soft-private",
  "[&_th]:border-current/15",
  "[&_td]:border-current/15",
);

/**
 * Renders `text` as markdown on the app's own tokens rather than a `prose`
 * plugin — `remark-gfm` covers tables, strikethrough and autolinks, and the two
 * `remark-cjk-friendly*` plugins are what let `**강조**` next to Korean/CJK
 * punctuation parse as `<strong>` instead of literal asterisks (CommonMark's own
 * emphasis rule refuses a closing `**` there).
 *
 * INFO: Used for a streaming AI answer, so it has to survive partial markdown —
 * an unterminated fence or a half-written table — without throwing. `react-markdown`
 * parses through `remark`/`micromark`, which treats unterminated syntax as plain
 * text rather than a parse error, so this needs no special-casing here.
 */
export function MarkdownBody({ className, text, isOnlyMe = false }: MarkdownBodyProps) {
  return (
    <div
      className={cn(
        BASE_MARKDOWN_CLASS_NAME,
        isOnlyMe ? THEME_ONLY_ME_CLASS_NAME : THEME_STANDARD_CLASS_NAME,
        className,
      )}
    >
      <Markdown
        remarkPlugins={MARKDOWN_PLUGINS}
        components={{
          a: (props) => <a target="_blank" rel="noreferrer noopener" {...props} />,
          table: (props) => (
            <div className="overflow-x-auto">
              <table {...props} />
            </div>
          ),
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
