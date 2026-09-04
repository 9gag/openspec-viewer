import { Outline, useOutlineFromDOM } from "@astryxdesign/core/Outline";
import { useEffect, useRef } from "react";

import { markSection } from "../highlight.js";
import { headingLink, linkedHeading } from "../toc.js";

/**
 * A document with an "On this page" rail beside it.
 *
 * The outline is read from the rendered DOM rather than from the markdown, so it can only
 * ever list headings that are actually on the page — and it re-reads on mutation, which
 * means switching tabs or loading a different change updates it without any wiring.
 *
 * Astryx's Outline does its own scroll-spy when `activeId` is left off, so the active
 * heading tracks scrolling for free.
 *
 * The rail is dropped entirely on narrow screens (see .with-outline in app.css) rather
 * than stacked above the content, where a table of contents is just a list to scroll past
 * on the way to the thing it indexes.
 */
export default function WithOutline({ children, label = "On this page" }) {
  const ref = useRef(null);
  const items = useOutlineFromDOM(ref);

  /*
   * The rail's own links, taken over.
   *
   * Astryx renders each entry as `<a href="#id">` and, on click, pushes `#id` over the
   * address bar. Under hash routing that is the route: `#/change/<id>` becomes
   * `#a-heading`, and because pushState fires no hashchange the page carries on rendering
   * as though nothing happened. Nothing looks wrong until the URL is copied or reloaded,
   * and by then the document it named is not in it.
   *
   * Preventing the default in the capture phase is Astryx's own escape hatch — its
   * handler returns early on an already-prevented event — so this takes the scroll and the
   * address bar together, and writes the heading after the route instead of over it.
   */
  const onRailClick = (event) => {
    const link = event.target.closest?.("a[href^='#']");
    if (!link) return;
    if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey)
      return;

    const id = decodeURIComponent(link.getAttribute("href").slice(1));
    const at = document.getElementById(id);
    if (!at) return; // nothing to scroll to; leave the click alone

    event.preventDefault();
    at.scrollIntoView({ block: "start", behavior: "smooth" });
    // A fragment-only relative URL, so everything before the `#` is kept — including the
    // `?mode=` a reader may be reading under, which the old shape overwrote on every rail
    // click because a `?…#…` reference replaces the query as well as the fragment.
    window.history.pushState(null, "", headingLink(id, window.location.hash));
  };

  /*
   * A link that named a heading opens on it — the same shape as the scenario a `?at=` link
   * asks for.
   *
   * Retried as the outline fills rather than once on mount: the heading has to be in the
   * DOM to be scrolled to, and on a cold load the document arrives from a fetch, renders,
   * and only then has headings. `items` changing is the signal that it does.
   */
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current) return;
    const asked = linkedHeading(window.location.hash);
    const at = asked && document.getElementById(asked);
    if (!at) return;
    scrolled.current = true;
    at.scrollIntoView({ block: "start" });
    markSection(at);
  }, [items]);

  return (
    <div className="with-outline">
      <div ref={ref}>{children}</div>
      {items.length > 1 && (
        // biome-ignore lint/a11y/useKeyWithClickEvents: delegation for the links inside, which are focusable and keyboard-activated in their own right
        <aside className="outline-rail" onClickCapture={onRailClick}>
          <Outline items={items} label={label} density="compact" />
        </aside>
      )}
    </div>
  );
}
