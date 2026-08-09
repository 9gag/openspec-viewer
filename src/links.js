/**
 * Where a link inside a rendered document should point.
 *
 * Markdown in the store is written to be read on disk, so its links are relative to the
 * file they sit in: a spec cites its PRD as `../../../docs/prds/x.md`. Left alone, the
 * browser resolves that against the page's own URL — which under hash routing is always
 * `/` — and asks the server for `/docs/prds/x.md`, a path no route owns. Resolving the
 * link against the document it came from, and re-expressing it as the route that serves
 * documents, is what makes it arrive.
 *
 * Pure string work, and no `node:path`: this runs in the browser, and store paths are
 * always `/`-separated regardless of the platform the store is checked out on.
 */

/** `scheme:` or protocol-relative `//host` — someone else's address, left alone. */
const ABSOLUTE = /^([a-z][a-z0-9+.-]*:|\/\/)/i;

const isMarkdown = (path) => /\.md$/i.test(path);

const dirOf = (path) => {
  const cut = path.lastIndexOf("/");
  return cut === -1 ? "" : path.slice(0, cut);
};

const splitFragment = (href) => {
  const cut = href.indexOf("#");
  return cut === -1
    ? { path: href, fragment: "" }
    : { path: href.slice(0, cut), fragment: href.slice(cut + 1) };
};

/**
 * Apply `.` and `..` segments. Null when the path climbs past the store root, which is
 * the one case that must not be silently clamped: `../../../../etc/passwd` resolving to
 * `etc/passwd` would turn a typo into a request for a real file somewhere else.
 */
function collapse(path) {
  const out = [];
  for (const segment of path.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment !== "..") {
      out.push(segment);
      continue;
    }
    if (out.length === 0) return null;
    out.pop();
  }
  return out.join("/");
}

/** The route that renders a store document, fragment and all. */
export const docHref = (path, fragment = "") =>
  `#/doc/${encodeURIComponent(fragment ? `${path}#${fragment}` : path)}`;

/**
 * Split the route argument back into the document and the heading within it.
 *
 * The two travel in one encoded segment because the router reads a path as
 * `#/<view>/<arg>` and a second `#` cannot appear in a hash — `encodeURIComponent`
 * turns it into `%23`, so the pair survives as one segment and comes back apart here.
 */
export function splitDocArg(arg) {
  return splitFragment(arg ?? "");
}

/**
 * Resolve one markdown link. Returns the kind of destination it turned out to be, so
 * the renderer can decide how to present it:
 *
 * - `anchor`   somewhere on this page already
 * - `external` another origin, or a `mailto:`
 * - `doc`      a markdown file in the store, with `href` pointing at its route
 * - `dead`     resolvable, but nothing the viewer can serve — a non-markdown file, or a
 *              path that climbs out of the store
 */
export function resolveLink(href, base = "") {
  if (!href) return { kind: "dead", href: "", reason: "empty link" };
  if (href.startsWith("#")) return { kind: "anchor", href };
  if (ABSOLUTE.test(href)) return { kind: "external", href };

  const { path, fragment } = splitFragment(href);
  // A leading slash means store-root-relative. Nothing in the store writes links that
  // way today, but it is the natural reading, and the alternative is treating it as
  // relative to the document — which would silently point somewhere else entirely.
  const joined = path.startsWith("/")
    ? path.slice(1)
    : [dirOf(base), path].filter(Boolean).join("/");

  const resolved = collapse(joined);
  if (resolved === null) {
    return { kind: "dead", href, reason: "outside the store" };
  }
  if (!isMarkdown(resolved)) {
    return {
      kind: "dead",
      href,
      path: resolved,
      reason: "the viewer serves markdown only",
    };
  }

  return {
    kind: "doc",
    href: docHref(resolved, fragment),
    path: resolved,
    fragment,
  };
}
