import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { Children, cloneElement, isValidElement } from "react";

import { emphasize } from "../bdd.js";
import { anchor } from "../toc.js";

/**
 * Markdown renderer overrides, shared by every artifact on the dashboard.
 *
 * `heading` exists to put an id on each heading: Astryx renders markdown headings without
 * one, and its `useOutlineFromDOM` only collects headings that have an id. Doing it here
 * rather than parsing the markdown a second time keeps the rendered DOM the single source
 * of truth for the outline — the rail can never list a heading that is not on the page.
 */

/** Colour the obligation words inside any string child, recursing through inline markup. */
function highlightObligations(children) {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      const parts = emphasize(child);
      if (parts.length === 1 && !parts[0].kind) return child;
      return parts.map((part, i) =>
        part.kind ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts are positions within one string, re-split on every render
          <span key={i} className="bdd-obligation">
            {part.text}
          </span>
        ) : (
          part.text
        ),
      );
    }
    if (isValidElement(child) && child.props?.children) {
      return cloneElement(child, {
        children: highlightObligations(child.props.children),
      });
    }
    return child;
  });
}

export function mdComponents({ prefix = "", bdd = false } = {}) {
  const components = {
    heading: ({ level, children }) => (
      <Heading
        level={Math.min(Math.max(level, 1), 6)}
        id={anchor(prefix, children)}
      >
        {children}
      </Heading>
    ),
  };

  // Only for specs: a stray "must" in a proposal is prose, not an obligation.
  if (bdd)
    components.paragraph = ({ children }) => (
      <Text as="p">{highlightObligations(children)}</Text>
    );

  return components;
}
