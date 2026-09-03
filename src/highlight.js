/**
 * How much of a document a link is pointing at, and marking it on arrival.
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

/**
 * The class the mark is drawn with, and how long it stays on the elements wearing it.
 * The fade itself is `.linked-area` in app.css; this only has to outlast it.
 */
const LINKED = "linked-area";
const LINGER = 3000;

/**
 * Mark what a link arrived at.
 *
 * Scrolling to the thing a link named leaves it where it would be if the reader had
 * scrolled there themselves — at the top of the window, or in the middle of it — so the
 * page gives no sign of having answered anything, and a document of forty headings offers
 * no way to tell the one that was asked for from the one above it.
 *
 * A heading takes its whole section with it, since the heading is only the address and the
 * section is what the link was about. Anything else is marked alone: a scenario is a
 * `<section>` that already holds everything it is, and there is no level to end a run on.
 *
 * The class comes off afterwards, so nothing is left behind on nodes React will render the
 * next document into. Taking it off elements a navigation has already detached costs
 * nothing, which is why no cleanup is wired to the caller's lifetime.
 */
export function markSection(at) {
  const siblings = Array.from(at.parentElement?.children ?? []);
  const marked = sectionSpan(
    siblings.map((el) => el.tagName),
    siblings.indexOf(at),
  ).map((position) => siblings[position]);

  for (const el of marked) el.classList.add(LINKED);
  setTimeout(() => {
    for (const el of marked) el.classList.remove(LINKED);
  }, LINGER);
}
