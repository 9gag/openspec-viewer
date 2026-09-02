/**
 * Anchors are matched against Astryx's own slug scheme, so a drift here shows up as an
 * outline whose links quietly do nothing. These pin the scheme and the namespacing.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { anchor, nodeText, slugify } from "../src/toc.js";

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
