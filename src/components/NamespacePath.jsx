import { Link } from "@astryxdesign/core/Link";
import { href } from "../api.js";

/**
 * A namespace, stepped through segment by segment.
 *
 * Arrows rather than the slashes the path is written with, because that is what it is:
 * an application, then an area inside it. `storefront/checkout` reads as one token to be
 * matched against a directory; `storefront → checkout` reads as two places, which is how
 * the nav draws it and how anyone says it out loud.
 *
 * Every segment is its own link, to the namespace that segment ends: a parent is a place
 * in the tree exactly as much as the leaf is, and the reader who wants "everything under
 * storefront" should not have to go via the one area they happened to be looking at. The
 * arrows are the separator and not the content, so they are quieter than the segments and
 * hidden from the outline — a reader who cannot see them hears the places, not "right
 * arrow".
 *
 * No size of its own: the line it sits on decides, through `.ns-line`, so the same
 * component sets a page title and sits inside a change page's title without either
 * caller having to say how big it is.
 */
export function NamespacePath({ path, current }) {
  const segments = path.split("/");

  return segments.map((segment, depth) => (
    <span key={segment} className="ns-step">
      {/* A plain span, not a <Text>: the separator has to take the size of whatever line
          it is on — a 24px title or a sentence — and Text would set 14px on both. */}
      {depth > 0 && (
        <span className="ns-sep" aria-hidden="true">
          →
        </span>
      )}
      {/* The segment you are already on is not a link: on a namespace's own page the
          last step is this page, and a chip that goes nowhere is the one thing on the
          line that should not invite a click. It also answers "which of these am I
          looking at", which the chips otherwise leave to the reader. */}
      {segments.slice(0, depth + 1).join("/") === current ? (
        <span className="ns-here">{segment}</span>
      ) : (
        <Link
          href={href("namespace", segments.slice(0, depth + 1).join("/"))}
          color="primary"
        >
          {segment}
        </Link>
      )}
    </span>
  ));
}

/**
 * Every namespace a change is filed under, on one line.
 *
 * The dot divides two whole namespaces, so it has to breathe wider than the arrows inside
 * them — at the same spacing, the last area of the first path reads as one more step in
 * it instead of the start of the second.
 */
export function NamespacePaths({ paths, current }) {
  return paths.map((path, i) => (
    <span key={path} className="ns-step">
      {i > 0 && (
        <span className="ns-sep" data-between aria-hidden="true">
          ·
        </span>
      )}
      <NamespacePath path={path} current={current} />
    </span>
  ));
}
