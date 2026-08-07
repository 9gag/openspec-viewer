import { Outline, useOutlineFromDOM } from "@astryxdesign/core/Outline";
import { useRef } from "react";

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

  return (
    <div className="with-outline">
      <div ref={ref}>{children}</div>
      {items.length > 1 && (
        <aside className="outline-rail">
          <Outline items={items} label={label} density="compact" />
        </aside>
      )}
    </div>
  );
}
