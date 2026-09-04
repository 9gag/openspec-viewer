import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Heading } from "@astryxdesign/core/Heading";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { Children, cloneElement, isValidElement } from "react";

import { emphasize } from "../bdd.js";
import CopyLink from "./CopyLink.jsx";
import Diagram from "./Diagram.jsx";
import ScenarioRef from "./ScenarioRef.jsx";
import { resolveLink } from "../links.js";
import { anchor, nodeText } from "../toc.js";

/**
 * Markdown renderer overrides, shared by every artifact on the dashboard.
 *
 * `heading` exists to put an id on each heading: Astryx renders markdown headings without
 * one, and its `useOutlineFromDOM` only collects headings that have an id. Doing it here
 * rather than parsing the markdown a second time keeps the rendered DOM the single source
 * of truth for the outline — the rail can never list a heading that is not on the page.
 *
 * `code` exists to draw the diagrams. A fenced `mermaid` block is a picture written down;
 * everything else is code and renders as Astryx would have rendered it anyway.
 *
 * `link` exists because the store's markdown is written to be read on disk: its links are
 * relative to the file they sit in, and a renderer that passes them through unchanged
 * emits hrefs the browser resolves against the wrong base. `base` is the store path of
 * the document being rendered, and it is what makes that resolution possible — without
 * it a relative link cannot be resolved at all, so links are left alone.
 */

/**
 * A heading that can be pointed at.
 *
 * Every heading on a page already carries an anchor, for the outline rail — so each one is
 * an address the reader cannot see. The button is that address, handed over: a section of
 * a proposal or a requirement in a spec is what one person sends another, and without it
 * the only link they can send is the document, plus a sentence saying where to scroll to.
 *
 * It lives inside the heading rather than beside it so nothing about the heading's own
 * layout changes — Astryx sizes and spaces headings, and a wrapper around one would be
 * this file inventing a block element the rest of the document does not have. Icon-only,
 * so the outline rail — which reads heading text out of the DOM — still reads the heading.
 *
 * A heading with no sluggable text gets no anchor and so no button: there would be
 * nowhere for the link to land.
 */
export function HeadingWithLink({ level, id, children }) {
  return (
    <Heading level={level} id={id}>
      {children}
      {id && (
        <CopyLink
          className="heading-copy"
          to={id}
          label={`Copy link to ${nodeText(children)}`}
        />
      )}
    </Heading>
  );
}

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
 *
 * `inheritTextSize` is the same concern as inline code: Link types itself as body text
 * unless told to inherit, which is a size jump anywhere the surrounding text is smaller.
 */
function linkRenderer(base, inheritTextSize) {
  return function MarkdownLink({ href, children }) {
    const target = resolveLink(href, base);

    // An anchor is scrolled to rather than navigated to. The route lives in the hash, so
    // letting the browser follow `#a-heading` writes the anchor over it — the page still
    // renders, since the router now ignores a hash that is not a route, but the address
    // bar no longer says which document is open and a reload lands on the board.
    if (target.kind === "anchor") {
      return (
        <Link
          href={target.href}
          type={inheritTextSize ? "inherit" : undefined}
          onClick={(event) => {
            const at = document.getElementById(target.href.slice(1));
            if (!at) return; // nothing to scroll to; leave the browser to it
            event.preventDefault();
            at.scrollIntoView({ block: "center" });
          }}
        >
          {children}
        </Link>
      );
    }

    if (target.kind === "dead") {
      return (
        <span
          className="dead-link"
          title={`${target.path ?? href} — ${target.reason}`}
        >
          {children}
        </span>
      );
    }

    return (
      <Link
        href={target.href}
        isExternalLink={target.kind === "external"}
        type={inheritTextSize ? "inherit" : undefined}
      >
        {children}
      </Link>
    );
  };
}

export function mdComponents({
  prefix = "",
  bdd = false,
  base = "",
  inheritTextSize = false,
} = {}) {
  const components = {
    // Every fenced block still reaches CodeBlock; a mermaid one reaches it through
    // Diagram, which shows the source until its picture is ready and keeps showing it if
    // the diagram never parses.
    code: ({ code, language }) =>
      language === "mermaid" ? (
        <Diagram code={code} />
      ) : (
        <div className="code-block">
          <CodeBlock code={code} language={language} isCollapsible />
        </div>
      ),
    heading: ({ level, children }) => (
      <HeadingWithLink
        level={Math.min(Math.max(level, 1), 6)}
        id={anchor(prefix, children)}
      >
        {children}
      </HeadingWithLink>
    ),
  };

  // Inline code, which is sometimes a scenario id — and an id is a cross-reference the
  // page can resolve rather than a string to go and look up. ScenarioRef decides which of
  // the two a span is, from the ids the page resolved; everything it does not recognise
  // renders as code, which is what it is.
  //
  // Always installed, so a citation is live wherever the store writes one. The size rule
  // is unchanged and still belongs to the caller: Astryx sizes inline code off
  // `--text-code-size`, which is body size — right inside a document, wrong anywhere the
  // surrounding text is not. A task row is small text, and code that keeps its own size
  // renders a third larger than the words around it, on its own line-height.
  components.inlineCode = ({ children }) => (
    <ScenarioRef size={inheritTextSize ? "inherit" : undefined}>
      {children}
    </ScenarioRef>
  );

  // Only when the document's own path is known: resolving `../x.md` against nothing
  // would invent a destination, and a confidently wrong link is worse than the dead one
  // this replaces.
  if (base) components.link = linkRenderer(base, inheritTextSize);

  // Only for specs: a stray "must" in a proposal is prose, not an obligation.
  if (bdd)
    components.paragraph = ({ children }) => (
      <Text as="p">{highlightObligations(children)}</Text>
    );

  return components;
}
