/**
 * Anchor ids for rendered headings, so a long artifact can be navigated.
 *
 * Astryx renders markdown headings without ids, and its `useOutlineFromDOM` only collects
 * headings that have one — so the id has to be put on at render time. Deriving it from the
 * heading's own text makes the DOM the single source of truth for the outline: no second
 * parse of the markdown to drift out of step with what was actually rendered.
 */

/**
 * Matches Astryx's own `parseOutlineFromMarkdown` slug scheme, so an outline built either
 * way lands on the same anchors.
 */
export function slugify(text) {
  return String(text)
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The text inside a rendered heading, which arrives as React children rather than a
 * string — `## The cart **SHALL** hold items` is a string, an element, and a string.
 *
 * Kept free of React imports so it can be tested on plain nested arrays.
 */
export function nodeText(node) {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && node.props)
    return nodeText(node.props.children);
  return "";
}

/**
 * A heading's anchor, namespaced by the document it belongs to.
 *
 * The specs view stacks several capabilities on one page and every spec has a "Purpose"
 * and a "Requirements" — without the prefix they would all claim the same anchor and the
 * outline would scroll to the first one every time.
 */
export const anchor = (prefix, children) => {
  const slug = slugify(nodeText(children));
  if (!slug) return undefined;
  return prefix ? `${prefix}--${slug}` : slug;
};

/**
 * The query key a link to a heading travels in, and the address of one.
 *
 * The fragment is already the route — `#/change/<id>` — and a URL has only one, so an
 * anchor cannot go there without taking the route's place. Astryx's outline does exactly
 * that: every rail click pushes `#<heading>` over the route. It fires no `hashchange`, so
 * the page carries on rendering and nothing looks wrong until the URL is copied or
 * reloaded, at which point the document it named is gone from it.
 *
 * So a heading rides in the query, beside the route rather than over it. That is the same
 * arrangement a scenario link already uses, for the same reason.
 */
export const HEADING_KEY = "to";

/** A link to one heading on the page currently routed to. */
export const headingLink = (id, route = "") =>
  `?${HEADING_KEY}=${encodeURIComponent(id)}${route}`;

/** The heading a link asked for, from a query string. */
export const linkedHeading = (search = "") =>
  new URLSearchParams(search).get(HEADING_KEY);

/**
 * The key a link to a scenario travels in, spelled here beside the heading's because the
 * two are dropped together — see `withoutPosition`.
 */
export const SCENARIO_KEY = "at";

/**
 * The query a URL should carry once the page it described is gone.
 *
 * `?to=` and `?at=` name a position inside one page: a heading in the document that was
 * open, a scenario in the spec that was. Follow a link out of that page — a change in the
 * nav, another tab, anything that writes the route without writing a position of its own —
 * and the browser keeps the query, because only the fragment changed. The address then
 * says the reader is somewhere they are not, and reloading it hunts for an anchor the new
 * page has never heard of.
 *
 * Everything else in the query survives, because it is not about a position: `?mode=dark`
 * is the reading the link was written for and lasts the visit.
 */
export function withoutPosition(search = "") {
  const params = new URLSearchParams(search);
  params.delete(HEADING_KEY);
  params.delete(SCENARIO_KEY);
  const rest = params.toString();
  return rest ? `?${rest}` : "";
}

/**
 * A link on this page, said in full — what a reader pastes into a message.
 *
 * `search` is the query naming the position inside the page (`?to=` for a heading, `?at=`
 * for a scenario) and the route comes from the address bar, so the two halves of the
 * arrangement above are put back together in the order a URL wants them: the query first,
 * the routing fragment last.
 */
export const absoluteLink = (search, at = window.location) =>
  `${at.origin}${at.pathname}${search}${at.hash}`;
