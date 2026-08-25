import { cn } from "@/shared/lib";
import Markdown from "react-markdown";
import remarkCjkFriendly from "remark-cjk-friendly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough";
import remarkGfm from "remark-gfm";

export type MarkdownBodyProps = {
  className?: string;
  text: string;
};

const MARKDOWN_CLASS_NAME = cn(
  "space-y-2xs text-chat-body text-bubble-ink",
  "[&_p]:[overflow-wrap:anywhere] [&_p]:whitespace-pre-wrap",
  // INFO: DESIGN.md § 6.11. Three steps and no more — preflight resets every heading to the body's own size, and a bubble this narrow has room to say "heading" three ways before the smallest one lands under `chat-body` itself.
  "[&_:is(h3,h4,h5,h6)]:font-semibold [&_h1]:text-display-sm [&_h2]:text-title-md",
  // WARN: `!` because `space-y-2xs` on the wrapper writes the same `margin-top` at a specificity these arbitrary variants do not clear.
  "[&_:is(h1,h2,h3,h4,h5,h6)]:mt-xs! [&_:is(h1,h2,h3,h4,h5,h6):first-child]:mt-0!",
  // WARN: `border-hairline` is what tames it rather than what draws it — preflight already gives `hr` a 1px top border in `currentColor`, which inside a bubble is `bubble-ink` at full strength.
  "[&_hr]:my-xs! [&_hr]:border-t [&_hr]:border-hairline",
  "[&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_a:hover]:text-primary-hover",
  "[&_ol]:list-decimal [&_ol]:space-y-2xs [&_ol]:pl-md [&_ul]:list-disc [&_ul]:space-y-2xs [&_ul]:pl-md",
  "[&_blockquote]:border-l-2 [&_blockquote]:border-hairline [&_blockquote]:pl-sm [&_blockquote]:text-meta",
  "[&_code]:rounded-xs [&_code]:border [&_code]:border-hairline [&_code]:bg-surface-soft [&_code]:px-2xs [&_code]:py-px",
  "[&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:border-hairline [&_pre]:bg-surface-soft [&_pre]:p-sm",
  "[&_pre_code]:border-0 [&_pre_code]:bg-transparent [&_pre_code]:p-0",
  "[&_table]:w-full [&_table]:border-collapse [&_table]:text-left",
  "[&_th]:border-b [&_th]:border-hairline [&_th]:px-sm [&_th]:py-2xs [&_th]:font-semibold",
  "[&_td]:border-b [&_td]:border-hairline [&_td]:px-sm [&_td]:py-2xs",
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
export function MarkdownBody({ className, text }: MarkdownBodyProps) {
  return (
    <div className={cn(MARKDOWN_CLASS_NAME, className)}>
      <Markdown
        // WARN: `remarkGfm` first. `remark-cjk-friendly-gfm-strikethrough`'s own README states it does nothing placed ahead of GFM — it patches GFM's `~~` construct — and `remark-cjk-friendly` documents the same order for its emphasis fix.
        remarkPlugins={[remarkGfm, remarkCjkFriendly, remarkCjkFriendlyGfmStrikethrough]}
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
