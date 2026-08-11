/*
  Class strings that were being retyped.

  Three of these were byte-identical copies living in ItemCard, ItemBody and PartsEditor;
  the uppercase-label recipe appeared in seventeen places; and the disabled treatment had
  drifted into two different opacities depending on whether a control went through
  `Button.svelte` or was hand-rolled. None of that was a bug on its own — it is the kind
  of thing that becomes one the first time somebody fixes a focus ring in four files and
  misses the fifth.

  Plain exported strings rather than a `cva`-style helper: Tailwind has to see these
  literally to emit the utilities, and a function that composes class names at runtime is
  exactly how a utility silently stops being generated.
*/

/** The focus treatment every interactive control shares. */
export const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * A square target big enough to hit.
 *
 * `size-7` is 28px. The controls this replaces were as small as 15×16px sitting in rows
 * with 2px between them, which fails WCAG 2.2 SC 2.5.8 on both the size rule and the
 * spacing exception that would otherwise excuse it. 28px at 4px spacing clears both.
 */
export const HIT = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md';

/** One disabled treatment, shared, so a control does not fade differently by origin. */
export const DISABLED = 'disabled:cursor-not-allowed disabled:opacity-40';

/** A compact `<select>` or `<input>` sitting in an item or rubric header. */
export const CONTROL =
  'rounded border border-border-subtle bg-surface px-2 py-1 text-xs text-text ' +
  'focus:border-border-strong focus:outline-2 focus:outline-accent';

/** The small uppercase caption above a field. */
export const LABEL = 'text-xs font-medium tracking-wide text-text-muted uppercase';
