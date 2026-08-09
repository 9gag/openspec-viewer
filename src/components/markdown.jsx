import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Children, cloneElement, isValidElement } from "react";

import { emphasize } from "../bdd.js";
import { resolveLink } from "../links.js";
import { anchor } from "../toc.js";

/**
 * Markdown renderer overrides, shared by every artifact on the dashboard.
 *
 * `heading` exists to put an id on each heading: Astryx renders markdown headings without
 * one, and its `useOutlineFromDOM` only collects headings that have an id. Doing it here
 * rather than parsing the markdown a second time keeps the rendered DOM the single source
 * of truth for the outline — the rail can never list a heading that is not on the page.
 *
 * `link` exists because the store's markdown is written to be read on disk: its links are
 * relative to the file they sit in, and a renderer that passes them through unchanged
 * emits hrefs the browser resolves against the wrong base. `base` is the store path of
 * the document being rendered, and it is what makes that resolution possible — without
 * it a relative link cannot be resolved at all, so links are left alone.
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

/**
 * A link renderer bound to the document it renders links for.
 *
 * A destination the viewer cannot serve is rendered as plain text carrying the resolved
 * path in its tooltip, rather than as a link that navigates to a 404. The reader still
 * learns where the thing lives, which is what the link was for, and nothing on the page
 * makes a promise the server will not keep.
 */
function linkRenderer(base) {
  return function MarkdownLink({ href, children }) {
    const target = resolveLink(href, base);

    if (target.kind === "dead") {
      return (
        <span className="dead-link" title={`${target.path ?? href} — ${target.reason}`}>
          {children}
        </span>
      );
    }

    return (
      <Link href={target.href} isExternalLink={target.kind === "external"}>
        {children}
      </Link>
    );
  };
}

export function mdComponents({ prefix = "", bdd = false, base = "" } = {}) {
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

  // Only when the document's own path is known: resolving `../x.md` against nothing
  // would invent a destination, and a confidently wrong link is worse than the dead one
  // this replaces.
  if (base) components.link = linkRenderer(base);

  // Only for specs: a stray "must" in a proposal is prose, not an obligation.
  if (bdd)
    components.paragraph = ({ children }) => (
      <Text as="p">{highlightObligations(children)}</Text>
    );

  return components;
}
