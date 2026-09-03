/**
 * Anchors are matched against Astryx's own slug scheme, so a drift here shows up as an
 * outline whose links quietly do nothing. These pin the scheme and the namespacing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  absoluteLink,
  anchor,
  headingLink,
  linkedHeading,
  nodeText,
  slugify,
  withoutPosition,
} from "../src/toc.js";

describe("slugify", () => {
  it("lowercases, strips punctuation and collapses separators", () => {
    assert.equal(
      slugify("Requirement: Cart holds line items"),
      "requirement-cart-holds-line-items",
    );
    assert.equal(
      slugify("  Guest checkout — a shopper's flow  "),
      "guest-checkout-a-shoppers-flow",
    );
    assert.equal(slugify("MODIFIED Requirements"), "modified-requirements");
  });

  it("is empty for text with nothing sluggable, so no anchor is invented", () => {
    assert.equal(slugify("—"), "");
    assert.equal(slugify("   "), "");
  });

  it("matches the scheme Astryx uses for its own outlines", () => {
    // Read from the shipped source rather than restated here: if Astryx changes its
    // slugs, an outline built by either side has to keep landing on the same anchors.
    const src = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        "..",
        "node_modules",
        "@astryxdesign",
        "core",
        "dist",
        "Markdown",
        "parser.js",
      ),
      "utf8",
    );
    const body = src.match(
      /function slugify\(value\) \{\s*return ([^;]+);/,
    )?.[1];
    assert.ok(body, "could not read Astryx slugify");

    const theirs = new Function("value", `return ${body};`);
    for (const sample of [
      "Requirement: Cart holds line items",
      "Scenario: Guest reloads during checkout",
      "MODIFIED Requirements",
      "Why  this   change",
    ]) {
      assert.equal(
        slugify(sample),
        theirs(sample),
        `slug differs for "${sample}"`,
      );
    }
  });
});

describe("nodeText", () => {
  it("flattens strings, arrays and elements into the heading text", () => {
    assert.equal(nodeText("Purpose"), "Purpose");
    assert.equal(
      nodeText(["The cart ", { props: { children: "SHALL" } }, " hold items"]),
      "The cart SHALL hold items",
    );
    assert.equal(
      nodeText({ props: { children: ["Requirement: ", "Cart"] } }),
      "Requirement: Cart",
    );
  });

  it("ignores nulls and booleans that React renders as nothing", () => {
    assert.equal(nodeText([null, "Purpose", false, undefined]), "Purpose");
    assert.equal(nodeText(null), "");
  });
});

describe("anchor", () => {
  it("namespaces by document so stacked specs do not share anchors", () => {
    assert.equal(anchor("cart", "Purpose"), "cart--purpose");
    assert.equal(
      anchor("guest-checkout", "Purpose"),
      "guest-checkout--purpose",
    );
  });

  it("works without a prefix for a page showing one document", () => {
    assert.equal(anchor("", "What Changes"), "what-changes");
    assert.equal(anchor(undefined, "What Changes"), "what-changes");
  });

  it("is undefined when there is nothing to slug, so no empty id is emitted", () => {
    // useOutlineFromDOM drops headings whose id is empty; an id of "cart--" would be
    // worse than none, since it would appear in the rail and scroll nowhere useful.
    assert.equal(anchor("cart", "—"), undefined);
    assert.equal(anchor("cart", ["", null]), undefined);
  });
});

/**
 * A link to a heading, which cannot live in the fragment.
 *
 * The fragment is the route, and a URL has one. Astryx's outline pushes `#<heading>` over
 * it on every rail click — silently, since pushState fires no hashchange — so the page
 * carries on rendering and only the copied or reloaded URL has lost the document it named.
 * The heading rides in the query instead, beside the route rather than over it.
 */
describe("headingLink", () => {
  it("keeps the route the reader is on", () => {
    assert.equal(
      headingLink("design--the-shape", "#/change/guest-checkout"),
      "?to=design--the-shape#/change/guest-checkout",
    );
  });

  it("survives a heading whose slug needs encoding", () => {
    assert.equal(headingLink("a b", "#/x"), "?to=a%20b#/x");
  });

  it("round-trips through the reader", () => {
    const link = headingLink("design--the-shape", "#/change/guest-checkout");
    assert.equal(
      linkedHeading(link.slice(0, link.indexOf("#"))),
      "design--the-shape",
    );
  });

  it("is null when nothing was asked for", () => {
    assert.equal(linkedHeading(""), null);
    assert.equal(linkedHeading("?filter=idle"), null);
  });
});

/**
 * What the copy button puts on the clipboard: the whole address, so the link works in a
 * message to someone who is not looking at this page.
 */
describe("absoluteLink", () => {
  const at = {
    origin: "http://localhost:5175",
    pathname: "/",
    hash: "#/doc/docs/prds/checkout.md",
  };

  it("puts the query before the route, which is where a URL wants it", () => {
    assert.equal(
      absoluteLink(headingLink("non-goals"), at),
      "http://localhost:5175/?to=non-goals#/doc/docs/prds/checkout.md",
    );
  });

  it("carries a scenario link the same way", () => {
    assert.equal(
      absoluteLink("?at=store-cart-SC-01", at),
      "http://localhost:5175/?at=store-cart-SC-01#/doc/docs/prds/checkout.md",
    );
  });

  it("keeps the mount point the page was served from", () => {
    assert.equal(
      absoluteLink("?to=purpose", { ...at, pathname: "/plan/" }),
      "http://localhost:5175/plan/?to=purpose#/doc/docs/prds/checkout.md",
    );
  });

  it("is the page itself when the reader is on the board, which has no route", () => {
    assert.equal(
      absoluteLink("?to=purpose", { ...at, hash: "" }),
      "http://localhost:5175/?to=purpose",
    );
  });
});

/**
 * A position in the query outlives the page it named, because following a link in the nav
 * writes the fragment and leaves the query where it was. What survives that is the rest.
 */
describe("withoutPosition", () => {
  it("drops the heading and the scenario a page was opened on", () => {
    assert.equal(withoutPosition("?to=non-goals"), "");
    assert.equal(withoutPosition("?at=cart-SC-01"), "");
    assert.equal(withoutPosition("?to=non-goals&at=cart-SC-01"), "");
  });

  it("keeps what is not about a position", () => {
    // The reading a link was written for lasts the visit; where the reader was on one
    // page does not.
    assert.equal(withoutPosition("?mode=dark&to=purpose"), "?mode=dark");
    assert.equal(
      withoutPosition("?board=full&filter=idle"),
      "?board=full&filter=idle",
    );
  });

  it("is empty for a URL that carried no query at all", () => {
    assert.equal(withoutPosition(""), "");
    assert.equal(withoutPosition("?"), "");
  });
});
