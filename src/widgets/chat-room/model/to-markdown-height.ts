import {
  measureFontFamily,
  measureInlineLines,
  measureLineHeight,
  type FontSpec,
  type InlineRun,
  type LineProbe,
  type Optional,
} from "@/shared/lib";
import { MARKDOWN_PLUGINS } from "@/shared/ui";
import type {
  FootnoteDefinition,
  Heading,
  List,
  PhrasingContent,
  Root,
  RootContent,
  Table,
  TableRow,
} from "mdast";
import remarkParse from "remark-parse";
import { unified } from "unified";

// WARN: Mirrors `markdown-body.tsx`'s class list, which cannot be read from here without a layout read per block. The two move together; a spacing change that skips this file shows up as REQUIREMENTS.md § 8.3. drift rather than as a visual bug.
const SPACING_2XS = 4;
const SPACING_XS = 8;
const SPACING_SM = 12;
const SPACING_MD = 16;
const HAIRLINE = 1;

const BODY_SIZE = 15;
const H1_SIZE = 18;
const H2_SIZE = 16;

const MONO_CLASS = "text-chat-body font-mono";
const CODE_LINE_KEY = "text-chat-body with-code";

/** WARN: Measured off the page, never `size × ratio` — WebKit floors a fractional line-height and Blink keeps it (`measureLineHeight`). */
const LINE = {
  body: () => measureLineHeight("text-chat-body", BODY_SIZE * 1.45),
  h1: () => measureLineHeight("text-display-sm", H1_SIZE * 1.45),
  h2: () => measureLineHeight("text-title-md", H2_SIZE * 1.45),
  code: () => measureLineHeight(CODE_LINE_KEY, BODY_SIZE * 1.45),
};

/**
 * How much taller a line carrying an inline `code` is than the block's own.
 *
 * WARN: Not zero, and not derivable from either font size. Both inline boxes are
 * `line-height` tall, but the mono face sits on the shared baseline out of a box of its
 * own proportions, so the line box grows to hold both — half a pixel a line, every line
 * an answer puts a symbol on.
 */
function toCodeLift(): number {
  return Math.max(0, LINE.code() - LINE.body());
}

/**
 * Every class this module probes, for `ROW_LINE_CLASSES` to hand `warmLineHeights`.
 *
 * INFO: The mono entry is probed for its **family** (`measureFontFamily`) as much as its line height — a fenced block draws in the stack preflight gives `pre`, which is not the one the scroller reports.
 */
export const MARKDOWN_LINE_CLASSES: LineProbe[] = [
  "text-display-sm",
  "text-title-md",
  MONO_CLASS,
  { key: CODE_LINE_KEY, className: "text-chat-body", html: "<code>가</code>가" },
];

// INFO: `[&_code]:px-2xs` and the hairline each side — an inline `code` box is that much wider than the characters in it, and its `py-px` adds no height, an inline box's padding never growing the line.
const INLINE_CODE_EXTRA = (SPACING_2XS + HAIRLINE) * 2;

// INFO: Preflight's `sup { font-size: 75%; line-height: 0 }` — a footnote marker takes three quarters of the width and none of the height.
const SUP_RATIO = 0.75;

// INFO: `[&_pre]:p-sm` and its hairline. The block never wraps — `overflow-x-auto` scrolls it instead — so its own lines are the source's, counted rather than laid out.
const CODE_BLOCK_PADDING = SPACING_SM * 2 + HAIRLINE * 2;

// INFO: `[&_:is(h1,h2,h3,h4,h5,h6)]:mt-xs!`, dropped on the first child, and `[&_hr]:my-xs!`.
const HEADING_MARGIN = SPACING_XS;
const RULE_MARGIN = SPACING_XS;

// INFO: `space-y-2xs`, which Tailwind v4 writes as `margin-block-end` on every child but the last — on the wrapper's own children and on every `ol`/`ul`'s.
const BLOCK_GAP = SPACING_2XS;

// INFO: `[&_th]:px-sm [&_th]:py-2xs` and the `border-b` a collapsed border draws once per row.
const CELL_PADDING_X = SPACING_SM * 2;
const CELL_PADDING_Y = SPACING_2XS * 2;

// INFO: `[&_blockquote]:border-l-2 [&_blockquote]:pl-sm` and `[&_ol,&_ul]:pl-md`, both taken off the width their content wraps in.
const QUOTE_INDENT = 2 + SPACING_SM;
const LIST_INDENT = SPACING_MD;

const TREE_CACHE_LIMIT = 200;
const trees = new Map<string, Root>();

const processor = unified().use(remarkParse).use(MARKDOWN_PLUGINS);

/**
 * One footnote as `remark-gfm` will render it.
 *
 * WARN: `number` is the order the **references** appear in and not the identifier — `[^b]`
 * ahead of `[^a]` prints `1`, and it is that digit the `sup` draws.
 */
type Footnote = {
  number: number;
  /** How many references point at it, which is how many `↩` backrefs its item carries. */
  references: number;
  definition: Optional<FootnoteDefinition>;
};

/** What a block cannot read off its own node: the resolved family, and the numbering `remark-gfm` resolves document-wide. */
type MarkdownContext = {
  fontFamily: string;
  /** INFO: Keyed by the uppercased identifier, exactly as `mdast-util-to-hast` keys its own map. */
  footnotes: ReadonlyMap<string, Footnote>;
};

/** One rendered block, and the margins that collapse against its siblings' rather than adding to them. */
type Box = {
  height: number;
  marginTop: number;
  marginBottom: number;
  /** DESIGN.md § 6.11. A heading gives its `mt-xs` back as `:first-child`, which is decided after the nodes that render nothing are dropped. */
  dropsFirstMargin?: boolean;
  /** An anonymous block box rather than an element — raw HTML, which `react-markdown` writes into the wrapper as escaped text. */
  isAnonymous?: boolean;
};

/** A run of blocks, with the margins at either end left for the container to collapse. */
type Flow = { height: number; leading: number; trailing: number };

/**
 * REQUIREMENTS.md § 8.3. How tall `MarkdownBody` will draw `text` at `width`, before it
 * renders.
 *
 * WARN: Parsed through `MARKDOWN_PLUGINS` — the bubble's own plugin list — rather than
 * detected with regular expressions. The block structure is what the height follows from,
 * and two readings of it drift the moment either side learns a construct the other has
 * not: a `---` under a paragraph is a setext heading and not a rule, a `|` line is a table
 * only where a delimiter row follows it, and both were wrong here before the parse was.
 *
 * WARN: Every width below is the **content** box. `box-sizing: border-box` puts the
 * bubble's hairline inside its width, so the caller has already taken it and the padding
 * off; an indent taken here is one the browser also takes.
 */
export function toMarkdownHeight(text: string, width: number, fontFamily: string): number {
  if (!text) {
    return 0;
  }

  const available = Math.max(width, BODY_SIZE);
  const tree = toTree(text);
  const context: MarkdownContext = { fontFamily, footnotes: toFootnotes(tree) };
  const boxes = toBoxes(tree.children, available, context);
  const footnotes = toFootnotesBox(available, context);
  const flow = toSpacedStack(footnotes ? [...boxes, footnotes] : boxes);

  // INFO: The bubble's `py-xs` is padding, so nothing collapses through it — the flow's own end margins stand inside it.
  return flow.leading + flow.height + flow.trailing;
}

function toTree(text: string): Root {
  const cached = trees.get(text);

  if (cached) {
    return cached;
  }

  // INFO: `react-markdown`'s own two steps — parse, then run the remark transformers over the tree, which is where `remark-cjk-friendly` re-reads emphasis next to Hangul.
  const tree = processor.runSync(processor.parse(text)) as Root;

  if (trees.size >= TREE_CACHE_LIMIT) {
    for (const stale of [...trees.keys()].slice(0, TREE_CACHE_LIMIT / 2)) {
      trees.delete(stale);
    }
  }

  trees.set(text, tree);

  return tree;
}

/**
 * The footnotes `remark-gfm` will render, keyed as `mdast-util-to-hast` keys them.
 *
 * WARN: A footnote is numbered by where its **reference** stands rather than by where it
 * was defined, and a definition nothing references is dropped entirely. The order is the
 * order the references are *rendered* in: the body's first, and then, in that same
 * order, whatever each called definition's own text cites — a definition's body is only
 * rendered inside the footer, after every reference in the body has been numbered.
 */
function toFootnotes(tree: Root): Map<string, Footnote> {
  const definitions = new Map<string, FootnoteDefinition>();
  const footnotes = new Map<string, Footnote>();
  const order: string[] = [];

  const reference = (id: string) => {
    const found = footnotes.get(id);

    if (found) {
      found.references += 1;

      return;
    }

    order.push(id);
    footnotes.set(id, { number: order.length, references: 1, definition: undefined });
  };

  walk(tree, (node) => {
    if (node.type === "footnoteDefinition") {
      // INFO: The first definition of an identifier wins, exactly as a link definition's does.
      if (!definitions.has(node.identifier.toUpperCase())) {
        definitions.set(node.identifier.toUpperCase(), node);
      }

      return false;
    }

    if (node.type === "footnoteReference") {
      reference(node.identifier.toUpperCase());
    }

    return true;
  });

  // INFO: `order` grows under the loop, exactly as `footer`'s does — a definition citing a footnote nobody in the body did appends it.
  for (let index = 0; index < order.length; index += 1) {
    const footnote = footnotes.get(order[index])!;

    footnote.definition = definitions.get(order[index]);

    for (const child of footnote.definition?.children ?? []) {
      walk(child, (node) => {
        if (node.type === "footnoteReference") {
          reference(node.identifier.toUpperCase());
        }

        return node.type !== "footnoteDefinition";
      });
    }
  }

  return footnotes;
}

/** Pre-order, descending into a node's children only where `visit` answers `true`. */
function walk(node: Root | RootContent, visit: (node: Root | RootContent) => boolean): void {
  if (!visit(node) || !("children" in node)) {
    return;
  }

  for (const child of node.children) {
    walk(child, visit);
  }
}

/**
 * WARN: Adjacent margins collapse, so a stack of blocks is `max(previous.bottom,
 * next.top)` between each pair and never the sum. `hr` sits between two of them at `my-xs`
 * and adds 8 above itself rather than 12, which is the difference reading as drift.
 */
function toStack(boxes: Box[]): Flow {
  if (boxes.length === 0) {
    return EMPTY_FLOW;
  }

  if (boxes[0].dropsFirstMargin) {
    boxes[0].marginTop = 0;
  }

  let height = boxes[0].height;

  for (let index = 1; index < boxes.length; index += 1) {
    height += Math.max(boxes[index - 1].marginBottom, boxes[index].marginTop) + boxes[index].height;
  }

  return { height, leading: boxes[0].marginTop, trailing: boxes[boxes.length - 1].marginBottom };
}

/**
 * WARN: `space-y-2xs` is a `margin-block-end` on every child but the last, and `:last-child`
 * counts **elements**. Raw HTML renders as bare text rather than as one, so the gap is
 * written onto the boxes here rather than applied between every pair — an anonymous box
 * neither carries one nor makes the element above it stop being last.
 */
function toSpacedStack(boxes: Box[]): Flow {
  const last = boxes.reduce((found, box, index) => (box.isAnonymous ? found : index), -1);

  boxes.forEach((box, index) => {
    if (!box.isAnonymous && index !== last) {
      box.marginBottom = Math.max(box.marginBottom, BLOCK_GAP);
    }
  });

  return toStack(boxes);
}

function toFlow(nodes: readonly RootContent[], width: number, context: MarkdownContext): Flow {
  return toStack(toBoxes(nodes, width, context));
}

function toBoxes(nodes: readonly RootContent[], width: number, context: MarkdownContext): Box[] {
  return nodes.map((node) => toBox(node, width, context)).filter((box) => box !== null);
}

const EMPTY_FLOW: Flow = { height: 0, leading: 0, trailing: 0 };

/**
 * INFO: `null` for a node that renders nothing at all — `react-markdown` carries no `rehype-raw`, so raw HTML and link definitions reach the DOM as no element, and a `:first-child` heading after one is still first.
 * INFO: A `footnoteDefinition` is one of those **in place**: `mdast-util-to-hast` moves every called one into the trailing section `toFootnotesBox` prices.
 */
function toLineHeights(value: string): number {
  return value ? value.split("\n").length * LINE.body() : 0;
}

function toBox(node: RootContent, width: number, context: MarkdownContext): Box | null {
  switch (node.type) {
    case "paragraph":
      return toTextBox(node.children, width, toBodyFont(context.fontFamily), true, context);
    case "heading":
      return toHeadingBox(node, width, context);
    case "thematicBreak":
      // INFO: Preflight gives `hr` its whole height from the `border-t`, and `[&_hr]:my-xs!` overrides the block gap on both of its sides.
      return { height: HAIRLINE, marginTop: RULE_MARGIN, marginBottom: RULE_MARGIN };
    case "code":
      // WARN: Counted, never wrapped — `overflow-x-auto` scrolls a long line rather than breaking it, so the source's own lines are the block's. Its mono face shares the body's line height, a unitless `line-height` resolving against the same 15px preflight leaves `pre` at.
      return {
        ...NO_MARGIN,
        height: toLineHeights(node.value) + CODE_BLOCK_PADDING,
      };
    case "blockquote":
      return toContainerBox(toFlow(node.children, width - QUOTE_INDENT, context));
    // WARN: Not nothing. `react-markdown` ships no `rehype-raw`, so an HTML node is written into the wrapper as **escaped text** — an anonymous box of ordinary body text, in the wrapper's own `normal` whitespace rather than a `<p>`'s `pre-wrap`.
    case "html":
      return {
        ...toTextBox(
          [{ type: "text", value: node.value }],
          width,
          toBodyFont(context.fontFamily),
          false,
          context,
        ),
        isAnonymous: true,
      };
    case "list":
      return toListBox(node, width, context);
    case "table":
      return { ...NO_MARGIN, height: toTableHeight(node, width, context) };
    default:
      return null;
  }
}

const NO_MARGIN = { marginTop: 0, marginBottom: 0 };

/**
 * WARN: A container with no padding or border of its own — a `blockquote` draws its box on
 * the left edge alone — does not stop its first and last child's margins escaping it. They
 * collapse with the container's own, which is what this hands back up.
 */
function toContainerBox({ height, leading, trailing }: Flow): Box | null {
  return height === 0 && leading === 0 && trailing === 0
    ? null
    : { height, marginTop: leading, marginBottom: trailing };
}

function toHeadingBox(heading: Heading, width: number, context: MarkdownContext): Box {
  const line = heading.depth === 1 ? LINE.h1() : heading.depth === 2 ? LINE.h2() : LINE.body();
  const box = toTextBox(
    heading.children,
    width,
    toHeadingFont(heading.depth, context.fontFamily),
    true,
    context,
    line,
  );

  return { ...box, marginTop: HEADING_MARGIN, dropsFirstMargin: true };
}

/**
 * WARN: `list.spread` decides whether a list item's paragraph survives as a `<p>`.
 * `mdast-util-to-hast` unwraps it in a tight list, and only a `<p>` carries
 * `whitespace-pre-wrap` — so the same item's newlines are line breaks in a loose list and
 * collapse to spaces in a tight one.
 */
function toListBox(list: List, width: number, context: MarkdownContext): Box | null {
  const isLoose = list.spread || list.children.some((item) => item.spread);
  const inner = width - LIST_INDENT;
  const items = list.children
    .map((item) =>
      toStack(
        item.children
          .map((node) =>
            !isLoose && node.type === "paragraph"
              ? toTextBox(node.children, inner, toBodyFont(context.fontFamily), false, context)
              : toBox(node, inner, context),
          )
          .filter((box) => box !== null),
      ),
    )
    .map(toContainerBox)
    .filter((box) => box !== null);

  // INFO: `[&_ol]:space-y-2xs [&_ul]:space-y-2xs` — every item but the last, exactly as the wrapper's own.
  return toContainerBox(toSpacedStack(items));
}

/**
 * DESIGN.md § 6.11. The `section` `remark-gfm` appends to an answer that cites a footnote.
 *
 * WARN: Its `h2` is `sr-only` and so out of flow, which leaves the section exactly as tall
 * as the `ol` inside it — an `ol` the `[&_ol]` utilities style like any other.
 */
function toFootnotesBox(width: number, context: MarkdownContext): Box | null {
  const items = [...context.footnotes.values()]
    .map((footnote) => toFootnoteItemBox(footnote, width - LIST_INDENT, context))
    .filter((box) => box !== null);

  return items.length === 0 ? null : toContainerBox(toSpacedStack(items));
}

/**
 * WARN: The `↩` backrefs go **inside** the item's last paragraph where it has one and
 * stand as a line of their own where it does not — `mdast-util-to-hast`'s own two
 * branches, and the difference is a whole line.
 */
function toFootnoteItemBox(
  { definition, references }: Footnote,
  width: number,
  context: MarkdownContext,
): Box | null {
  if (!definition) {
    return null;
  }

  const font = toBodyFont(context.fontFamily);
  const last = definition.children.length - 1;
  const isTailParagraph = definition.children[last]?.type === "paragraph";
  const boxes = definition.children
    .map((node, index) =>
      index === last && node.type === "paragraph"
        ? toTextBox(
            node.children,
            width,
            font,
            true,
            context,
            LINE.body(),
            toBackrefRuns(references, font),
          )
        : toBox(node, width, context),
    )
    .filter((box) => box !== null);

  if (!isTailParagraph) {
    boxes.push({ ...NO_MARGIN, height: LINE.body() });
  }

  return toContainerBox(toStack(boxes));
}

// INFO: One `↩` per reference, each after the space `mdast-util-to-hast` writes before it, and numbered from the second on.
function toBackrefRuns(references: number, font: FontSpec): InlineRun[] {
  return Array.from({ length: references }).flatMap<InlineRun>((_, index) =>
    index === 0
      ? [{ text: " ↩", font }]
      : [
          { text: " ↩", font },
          { text: String(index + 1), font: toSupFont(font) },
        ],
  );
}

/**
 * WARN: An auto-layout table is the one block here that cannot be resolved exactly — CSS
 * leaves the distribution of a table's width across its columns to the UA. The columns are
 * given their max-content where the row can afford it and the surplus in proportion to
 * what each asked for otherwise, which is what both engines do in the ordinary case.
 */
function toTableHeight(table: Table, width: number, context: MarkdownContext): number {
  const rows = table.children;

  if (rows.length === 0) {
    return 0;
  }

  const columns = Math.max(...rows.map((row) => row.children.length));
  const widths = toColumnWidths(columns, width);

  return rows.reduce(
    (total, row, index) => total + toRowHeight(row, widths, context, index === 0),
    0,
  );
}

/**
 * WARN: `table-fixed` is what makes this knowable, and `markdown-body.tsx` carries it for
 * this reason — an auto-layout table's columns are distributed by the UA, and Blink and
 * WebKit disagree by tens of pixels on the same answer. Fixed, every column is an equal
 * share of the table's own width.
 */
function toColumnWidths(columns: number, width: number): number[] {
  return Array.from({ length: columns }, () => Math.max(width / columns - CELL_PADDING_X, 1));
}

function toRowHeight(
  row: TableRow,
  widths: readonly number[],
  context: MarkdownContext,
  isHeader: boolean,
): number {
  const font = isHeader ? toHeaderFont(context.fontFamily) : toBodyFont(context.fontFamily);
  const cells = row.children.map((cell, index) =>
    measureInlineLines(toRuns(cell.children, font, context, false), font, widths[index] ?? 0),
  );
  const lines = cells.reduce((tallest, { lineCount }) => Math.max(tallest, lineCount), 1);
  const tall = cells.reduce((tallest, { tallLineCount }) => Math.max(tallest, tallLineCount), 0);

  // INFO: `border-collapse` draws the `border-b` once between two rows, so it is one hairline per row rather than two.
  return lines * LINE.body() + tall * toCodeLift() + CELL_PADDING_Y + HAIRLINE;
}

/**
 * WARN: `pre-wrap` is a property of the `<p>` and not of the text — a tight list item's
 * content is unwrapped into the `li`, where a newline collapses to a space like any other
 * whitespace. Measured the other way every such item is priced a line per source line.
 */
function toTextBox(
  children: readonly PhrasingContent[],
  width: number,
  font: FontSpec,
  isPreWrap: boolean,
  context: MarkdownContext,
  line = LINE.body(),
  extraRuns: readonly InlineRun[] = [],
): Box {
  const runs = [...toRuns(children, font, context, isPreWrap), ...extraRuns];
  const { lineCount, tallLineCount } = measureInlineLines(runs, font, width);

  // INFO: An empty block lays out no line box at all — `#` alone is a heading of zero height, which is what the browser draws for it.
  return { ...NO_MARGIN, height: lineCount * line + tallLineCount * toCodeLift() };
}

/**
 * The inline content of one block, as runs the measurer can lay out.
 *
 * WARN: `em` contributes no run of its own on purpose. The app ships no italic face, so
 * both the browser and the canvas synthesize an oblique — a shear, which advances
 * identically to the upright. A `font-style` passed here would be a difference neither
 * engine draws.
 */
function toRuns(
  children: readonly PhrasingContent[],
  font: FontSpec,
  context: MarkdownContext,
  isPreWrap: boolean,
): InlineRun[] {
  const { fontFamily } = context;

  return children.flatMap<InlineRun>((child) => {
    switch (child.type) {
      case "text":
        // INFO: Outside a `pre-wrap` box every run of whitespace — a source newline included — draws as one space.
        return [{ text: isPreWrap ? child.value : child.value.replace(/\s+/gu, " "), font }];
      case "inlineCode":
        // INFO: Preflight gives `code` the mono stack at `font-size: 1em`, and `[&_code]` puts a padded, bordered box around it.
        return [
          {
            text: child.value,
            font: { ...font, family: measureFontFamily(MONO_CLASS, fontFamily) },
            extraWidth: INLINE_CODE_EXTRA,
            isTall: true,
          },
        ];
      case "strong":
        // INFO: Preflight's `strong { font-weight: bolder }`, which is relative to what it inherits rather than a value — inside an `h1` at 600 it resolves to 900, not to 700.
        return toRuns(
          child.children,
          { ...font, weight: toBolder(font.weight) },
          context,
          isPreWrap,
        );
      case "emphasis":
      case "delete":
      case "link":
      case "linkReference":
        return toRuns(child.children, font, context, isPreWrap);
      // INFO: `<sup>` around the marker `mdast-util-to-hast` numbers by reference order; `line-height: 0` keeps it off the line's height.
      case "footnoteReference":
        return [
          {
            text: String(context.footnotes.get(child.identifier.toUpperCase())?.number ?? 1),
            font: toSupFont(font),
          },
        ];
      // WARN: Two breaks under `pre-wrap` and one otherwise. `mdast-util-to-hast` emits a literal newline **after** the `<br>` to keep its own output readable, and a `pre-wrap` box lays that out as a second line where every other box collapses it away.
      case "break":
        return [{ text: isPreWrap ? "\n\n" : "\n", font }];
      default:
        return [];
    }
  });
}

// INFO: CSS Fonts 4's own table for the `bolder` keyword, which is a step from the inherited weight and not a number.
function toBolder(weight: number): number {
  if (weight < 350) {
    return 400;
  }

  if (weight < 550) {
    return 700;
  }

  return weight < 750 ? 900 : weight;
}

// WARN: The type scale of `theme.css`, weights included — preflight resets a heading to the body's size and the `text-*` utility is what gives it one back, so these are the utilities' own numbers and not the tag's.
function toBodyFont(family: string): FontSpec {
  return { size: BODY_SIZE, weight: 400, family };
}

function toSupFont(font: FontSpec): FontSpec {
  return { ...font, size: font.size * SUP_RATIO };
}

function toHeaderFont(family: string): FontSpec {
  return { size: BODY_SIZE, weight: 600, family };
}

function toHeadingFont(depth: Heading["depth"], family: string): FontSpec {
  if (depth === 1) {
    return { size: H1_SIZE, weight: 600, family };
  }

  return depth === 2
    ? { size: H2_SIZE, weight: 600, family }
    : // INFO: `[&_:is(h3,h4,h5,h6)]:font-semibold` and nothing else — preflight left them at the body's size, which is the whole of DESIGN.md § 6.11.'s three steps.
      { size: BODY_SIZE, weight: 600, family };
}
