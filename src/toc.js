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
 * The keys a position inside a page travels in: `to` for a heading, `at` for a scenario.
 *
 * Both ride in the fragment, after the route — `#/change/<id>?to=<heading>`. Query syntax,
 * but not the query: a URL has one fragment and this app spends it on the route, so the
 * position has to share it rather than take it. Astryx's outline pushes `#<heading>` over
 * the route if left alone, which fires no `hashchange` and so looks like nothing until the
 * URL is copied or reloaded, by which time the document it named is gone from it.
 *
 * Beside the route rather than in the query, because the query is the half that does not
 * move when the fragment does. A position parked there outlives the page it names: follow
 * anything in the nav and the address still says the reader is somewhere they are not.
 * Written into the fragment, a position is overwritten by the next route in the same
 * string, which is why nothing here sweeps up after it.
 */
export const HEADING_KEY = "to";
export const SCENARIO_KEY = "at";

/**
 * A route with a position inside the page it names.
 *
 * An empty id gives the route back unchanged — a heading with no sluggable text has no
 * anchor, and `?to=` naming nothing is an address that says less than the route alone.
 * A route of `""` still comes back as a fragment, so what is returned is always something
 * that can be assigned to `location.hash` or pushed as a relative URL.
 */
export function withPosition(route = "", key, id) {
  // Any position already on the route comes off first. A position is one place, so this
  // replaces rather than appends — the outline rail hands back the address it is standing
  // on, and a second click that added `&to=` beside the first would leave the reader on an
  // address naming the heading before the one they asked for.
  const cut = route.indexOf("?");
  const bare = cut === -1 ? route : route.slice(0, cut);
  if (!id) return bare;
  const fragment = bare.startsWith("#") ? bare : `#${bare}`;
  return `${fragment}?${key}=${encodeURIComponent(id)}`;
}

/**
 * The position a fragment names, or nulls.
 *
 * Split on the first `?`, which cannot be part of the route: every segment is written with
 * `encodeURIComponent`, so a capability or change whose name contained one carries it as
 * `%3F`. An empty value is no position rather than an empty one — `?to=` is what a link
 * to a heading with no anchor would have been, and it should land the reader at the top
 * rather than send them hunting for an element with no id.
 */
export function positionIn(hash = "") {
  const cut = String(hash ?? "").indexOf("?");
  const params = new URLSearchParams(cut === -1 ? "" : String(hash).slice(cut));
  return {
    [HEADING_KEY]: params.get(HEADING_KEY) || null,
    [SCENARIO_KEY]: params.get(SCENARIO_KEY) || null,
  };
}

/**
 * An address written before the position moved into the fragment, said the new way — or
 * null when it was already right, so an address with nothing to correct is left exactly as
 * it was rather than rewritten into an equivalent of itself.
 *
 * The fragment wins if both halves carry a position: the fragment is the shape this app
 * writes, so the half it recognises as its own is the one meant.
 */
export function movedPosition({ search = "", hash = "" } = {}) {
  const params = new URLSearchParams(search);
  const stale = [HEADING_KEY, SCENARIO_KEY].filter((key) => params.has(key));
  if (stale.length === 0) return null;

  const asked = positionIn(hash);
  const key = stale.find((k) => params.get(k));
  const moved =
    asked[HEADING_KEY] || asked[SCENARIO_KEY] || !key
      ? hash
      : withPosition(hash, key, params.get(key));

  for (const k of stale) params.delete(k);
  const rest = params.toString();
  return { search: rest ? `?${rest}` : "", hash: moved };
}

/** A link to one heading on the page currently routed to. */
export const headingLink = (id, route = "") =>
  withPosition(route, HEADING_KEY, id);

/** The heading a link asked for, from a fragment. */
export const linkedHeading = (hash = "") => positionIn(hash)[HEADING_KEY];

/**
 * A link on this page, said in full — what a reader pastes into a message.
 *
 * `hash` is the route and the position together, already assembled; the query comes from
 * the address bar untouched, so a link copied while reading in dark mode carries the
 * `?mode=dark` it was being read under.
 */
export const absoluteLink = (hash, at = window.location) =>
  `${at.origin}${at.pathname}${at.search ?? ""}${hash}`;
