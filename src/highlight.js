/**
 * How much of a document a link to a heading is pointing at.
 *
 * A heading is a position, but what the reader was sent for is the section under it —
 * so a link that lands on one marks the heading and everything below it down to the next
 * heading at the same level or above. That is the same rule a table of contents uses to
 * decide what a heading contains, and the rule the markdown itself is written under.
 *
 * Positions in a list of tag names rather than DOM nodes, so the rule is testable without
 * a document: the caller holds the elements and does the marking.
 */

const HEADING = /^H([1-6])$/;

/** The level of a heading tag, or 0 for anything that is not one. */
export function headingLevel(tag) {
  return Number(HEADING.exec(String(tag).toUpperCase())?.[1] ?? 0);
}

/**
 * The positions belonging to the section opened at `from`.
 *
 * An element that is not a heading is its own section and nothing else: a link can name
 * one — a scenario is a `<section>` with an id — and there is no level to end the run on,
 * so the alternative would be marking the rest of the document.
 */
export function sectionSpan(tags, from) {
  if (from < 0 || from >= tags.length) return [];

  const level = headingLevel(tags[from]);
  const span = [from];
  if (!level) return span;

  for (let at = from + 1; at < tags.length; at++) {
    const next = headingLevel(tags[at]);
    if (next && next <= level) break;
    span.push(at);
  }
  return span;
}
