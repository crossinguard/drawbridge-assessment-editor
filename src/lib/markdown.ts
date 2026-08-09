import DOMPurify from 'dompurify';
import { marked } from 'marked';

/*
  Markdown → HTML for the preview panes.

  Sanitising is not optional here, and it is not really about the author. They are
  typing into their own browser and could open the console if they wanted to do
  something silly. It is about IMPORT: a bundle is a plain zip that can arrive by
  email, from a colleague, or from a backup nobody has looked at in a year, and its
  stems land in `{@html}` the moment a collection is opened. marked stopped shipping a
  `sanitize` option years ago and now tells you to run a real sanitiser over the
  output, so that is what this does.

  DOMPurify is the boring, well-understood choice, which is the house preference. It is
  the one dependency here the build brief does not name — the brief asks for the
  sanitising, not for a particular library.

  This module is deliberately NOT in `domain/`: DOMPurify needs a DOM, and domain has
  to stay headless so it can be tested without one.
*/

marked.use({
  // Line breaks matter in a question stem — an author who presses Enter between two
  // lines of a data table means it.
  breaks: true,
  gfm: true
});

/**
 * Tags that survive sanitising.
 *
 * An allow-list rather than a block-list: anything not named here is stripped, so a
 * tag nobody thought about cannot arrive through an import and be rendered. Note the
 * absence of `img` — nothing in the app produces one yet, and allowing remote images
 * would put a network request into an app that promises to make none.
 */
const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'del', 'code', 'pre', 'blockquote',
  'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'a', 'hr', 'span', 'sub', 'sup'
];

const ALLOWED_ATTR = ['href', 'title', 'colspan', 'rowspan', 'align'];

/** Renders Markdown to sanitised HTML, safe to pass to `{@html}`. */
export function renderMarkdown(source: string): string {
  if (!source.trim()) return '';

  // `marked.parse` is sync unless an async extension is registered; none is.
  const raw = marked.parse(source) as string;

  return DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Blocks javascript:, data: and friends in href.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto):/i
  });
}

/**
 * A short plain-text summary, for list rows and the command palette.
 *
 * Strips Markdown syntax rather than rendering it — a heading marker or a table pipe
 * in a one-line summary is noise, and running the full renderer to then discard the
 * tags would be wasteful for something drawn once per row.
 */
export function summarise(source: string, limit = 90): string {
  /*
    Each replacement is deliberately narrow. A single character class over
    `[#>*_~|-]` looks tidier and is wrong twice over: it turns "**median**?" into
    "median ?" by leaving a space where the emphasis was, and it turns "well-known"
    into "well known" because it cannot tell a list bullet from a hyphen.

    So: markers are only stripped where they are line-leading, and emphasis is removed
    rather than replaced with a space.
  */
  const text = source
    .replace(/`{1,3}[^`]*`{1,3}/g, ' ') // code spans
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links and images, keeping the label
    .replace(/^\s{0,3}([#>]+|[-*+]|\d+[.)])\s+/gm, '') // list, heading and quote markers
    .replace(/\*\*|__|~~|\*|_/g, '') // emphasis
    .replace(/\|/g, ' ') // table cell separators
    .replace(/\s+/g, ' ')
    .trim();

  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
