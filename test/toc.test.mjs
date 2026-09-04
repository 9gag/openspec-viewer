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
  movedPosition,
  nodeText,
  positionIn,
  slugify,
  withPosition,
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
 * A link to a heading, which cannot take the fragment over.
 *
 * The fragment is the route, and a URL has one. Astryx's outline pushes `#<heading>` over
 * it on every rail click — silently, since pushState fires no hashchange — so the page
 * carries on rendering and only the copied or reloaded URL has lost the document it named.
 * The heading rides inside the fragment instead, after the route rather than over it.
 */
describe("headingLink", () => {
  it("keeps the route the reader is on", () => {
    assert.equal(
      headingLink("design--the-shape", "#/change/guest-checkout"),
      "#/change/guest-checkout?to=design--the-shape",
    );
  });

  it("survives a heading whose slug needs encoding", () => {
    assert.equal(headingLink("a b", "#/x"), "#/x?to=a%20b");
  });

  it("round-trips through the reader", () => {
    assert.equal(
      linkedHeading(
        headingLink("design--the-shape", "#/change/guest-checkout"),
      ),
      "design--the-shape",
    );
  });

  it("is null when nothing was asked for", () => {
    assert.equal(linkedHeading(""), null);
    assert.equal(linkedHeading("#/change/guest-checkout"), null);
  });

  it("is a fragment even with no route to hang off", () => {
    // Otherwise it is a bare query, which is the old shape — and the old shape is read on
    // the way in and rewritten, so writing one would send the app round that loop against
    // itself.
    assert.equal(headingLink("purpose"), "#?to=purpose");
  });

  it("gives the route back when there is no heading to name", () => {
    // A heading with no sluggable text has no anchor, and `?to=` naming nothing says less
    // than the route on its own.
    assert.equal(
      headingLink("", "#/change/guest-checkout"),
      "#/change/guest-checkout",
    );
    assert.equal(withPosition("#/x", "at", null), "#/x");
  });
});

/**
 * `withPosition` writes an address and `positionIn` reads one. Each is the other's inverse,
 * and nothing else in the app runs them against each other.
 */
describe("withPosition and positionIn", () => {
  it("round-trips every shape of id", () => {
    for (const id of [
      "purpose",
      "storefront%2Fcheckout--purpose",
      "a heading with spaces",
      "why?",
      "one/two",
      "100%",
    ])
      for (const key of ["to", "at"])
        for (const route of ["#/board", "#/spec/storefront%2Fcheckout", ""]) {
          const link = withPosition(route, key, id);
          assert.equal(positionIn(link)[key], id, `${key} ${id} on ${route}`);
        }
  });

  it("carries one key without inventing the other", () => {
    assert.deepEqual(positionIn(withPosition("#/x", "to", "purpose")), {
      to: "purpose",
      at: null,
    });
    assert.deepEqual(positionIn(withPosition("#/x", "at", "cart-SC-01")), {
      to: null,
      at: "cart-SC-01",
    });
  });

  it("replaces the position already on the route", () => {
    // The rail hands back the address it is standing on, so every click after the first
    // arrives with a `?to=` already there. Appending beside it would leave the reader on
    // an address naming the heading before the one they clicked.
    assert.equal(withPosition("#/x?to=first", "to", "second"), "#/x?to=second");
    assert.equal(
      withPosition("#/x?to=first", "at", "cart-SC-01"),
      "#/x?at=cart-SC-01",
    );
    assert.equal(withPosition("#/x?to=first", "to", null), "#/x");
  });

  it("is nulls for an address that names no position", () => {
    assert.deepEqual(positionIn(""), { to: null, at: null });
    assert.deepEqual(positionIn("#/change/guest-checkout"), {
      to: null,
      at: null,
    });
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
    search: "",
    hash: "#/doc/docs/prds/checkout.md",
  };

  it("puts the position inside the fragment, after the page it is inside", () => {
    assert.equal(
      absoluteLink(headingLink("non-goals", at.hash), at),
      "http://localhost:5175/#/doc/docs/prds/checkout.md?to=non-goals",
    );
  });

  it("carries a scenario link the same way", () => {
    assert.equal(
      absoluteLink(withPosition(at.hash, "at", "store-cart-SC-01"), at),
      "http://localhost:5175/#/doc/docs/prds/checkout.md?at=store-cart-SC-01",
    );
  });

  it("keeps the mount point the page was served from", () => {
    assert.equal(
      absoluteLink(headingLink("purpose", at.hash), {
        ...at,
        pathname: "/plan/",
      }),
      "http://localhost:5175/plan/#/doc/docs/prds/checkout.md?to=purpose",
    );
  });

  it("keeps the reading the page was being read under", () => {
    // The query is no longer where a position lives, which is what leaves it free to carry
    // the appearance a link was written for all the way to whoever it is sent to.
    assert.equal(
      absoluteLink(headingLink("purpose", at.hash), {
        ...at,
        search: "?mode=dark",
      }),
      "http://localhost:5175/?mode=dark#/doc/docs/prds/checkout.md?to=purpose",
    );
  });

  it("is the page itself when the reader is on a page with no route", () => {
    assert.equal(
      absoluteLink(headingLink("purpose", ""), { ...at, hash: "" }),
      "http://localhost:5175/#?to=purpose",
    );
  });
});

/**
 * `?to=` and `?at=` rode in the query before they rode in the fragment, and links in that
 * shape are pasted into tasks and messages that outlive the change of shape.
 */
describe("movedPosition", () => {
  it("moves a heading into the fragment", () => {
    assert.deepEqual(
      movedPosition({ search: "?to=purpose", hash: "#/spec/x" }),
      {
        search: "",
        hash: "#/spec/x?to=purpose",
      },
    );
  });

  it("moves a scenario and keeps the reading beside it", () => {
    assert.deepEqual(
      movedPosition({
        search: "?mode=dark&at=cart-SC-01",
        hash: "#/change/add-guest-checkout",
      }),
      {
        search: "?mode=dark",
        hash: "#/change/add-guest-checkout?at=cart-SC-01",
      },
    );
  });

  it("leaves the fragment's own position in place, and drops the query's", () => {
    // An address carrying both was assembled by something that is not this app, so the
    // half this app writes is the half that was meant.
    assert.deepEqual(
      movedPosition({ search: "?to=stale", hash: "#/spec/x?to=asked" }),
      { search: "", hash: "#/spec/x?to=asked" },
    );
  });

  it("is null for an address with no position to move", () => {
    // Not an equivalent rewrite: an address with nothing wrong with it is left exactly as
    // it arrived, so nothing lands in the reader's history for having opened a page.
    assert.equal(movedPosition({ search: "", hash: "#/spec/x" }), null);
    assert.equal(
      movedPosition({ search: "?mode=dark", hash: "#/spec/x" }),
      null,
    );
    assert.equal(movedPosition({}), null);
  });

  it("clears a key that names nothing", () => {
    assert.deepEqual(movedPosition({ search: "?to=", hash: "#/spec/x" }), {
      search: "",
      hash: "#/spec/x",
    });
  });

  it("round-trips into something the router reads", () => {
    // The point of the whole exercise: the corrected address is a route again, carrying
    // the position the old link was sent for.
    const { hash } = movedPosition({
      search: "?to=storefront%2Fcheckout--purpose",
      hash: "#/spec/storefront%2Fcheckout",
    });
    assert.equal(positionIn(hash).to, "storefront/checkout--purpose");
  });
});
