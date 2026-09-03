/**
 * The box takes two questions and has to keep them apart: a phrase, which only the store's
 * text can answer, and a name, which is a page the reader could have found in the tree if
 * they knew where it was filed.
 *
 * The ordering is the whole feature. A menu that puts `admin/checkout-audit` above
 * `storefront/checkout` for the word "checkout" is one the reader stops reading, and then
 * the box is a text field again. These pin what "best" means, and that the search itself
 * never loses its place at the top — it is the entry Enter takes, so the box has to keep
 * doing what it did before completions existed.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { score, suggestions } from "../src/suggest.js";

const store = {
  capabilities: [
    "storefront/checkout",
    "admin/checkout-audit",
    "shared/ui/cart",
    "shared/ui/late-checkouts",
  ],
  changes: ["add-guest-checkout", "cart-limits"],
};

const names = (query, lists = store) =>
  suggestions(query, lists).map((item) => item.auxiliaryData.arg);

describe("score", () => {
  it("ranks the last segment above the path it is filed under", () => {
    assert.ok(
      score("storefront/checkout", "checkout") <
        score("admin/checkout-audit", "checkout"),
    );
  });

  it("ranks a word boundary above letters found mid-word", () => {
    // `guest` is a word of `add-guest-checkout`; `front` is buried inside `storefront`.
    assert.ok(
      score("add-guest-checkout", "guest") <
        score("storefront/checkout", "front"),
    );
  });

  it("is null for a name the query is not in at all", () => {
    assert.equal(score("shared/ui/cart", "webhook"), null);
  });
});

describe("suggestions", () => {
  it("offers the search first, whatever else matched", () => {
    // Enter takes the first entry, so this is what keeps the box behaving as a search box
    // for a reader who never looks at the menu.
    const [first] = suggestions("checkout", store);
    assert.deepEqual(first.auxiliaryData, {
      kind: "search",
      view: "search",
      arg: "checkout",
    });
  });

  it("puts the capability named after the query above the one merely holding it", () => {
    assert.deepEqual(names("checkout"), [
      "checkout",
      "storefront/checkout",
      "admin/checkout-audit",
      "add-guest-checkout",
      "shared/ui/late-checkouts",
    ]);
  });

  it("completes changes as well as capabilities", () => {
    assert.deepEqual(
      suggestions("cart", store).map((item) => [
        item.auxiliaryData.kind,
        item.auxiliaryData.view,
      ]),
      [
        ["search", "search"],
        ["capability", "spec"],
        ["change", "change"],
      ],
    );
  });

  it("offers nothing at all for an empty box", () => {
    // Not even the search: there is nothing to search for, and a menu on an empty field
    // is a menu that answers no question.
    assert.deepEqual(suggestions("", store), []);
    assert.deepEqual(suggestions("   ", store), []);
  });

  it("still offers the search when no name matches", () => {
    assert.deepEqual(names("webhook"), ["webhook"]);
  });

  it("matches without regard to case, and searches for what was typed", () => {
    // The names match case-insensitively; the search keeps the reader's own spelling,
    // because that is what the page it opens is titled with.
    assert.deepEqual(names("  CART  "), [
      "CART",
      "shared/ui/cart",
      "cart-limits",
    ]);
  });

  it("survives a store with neither list", () => {
    assert.deepEqual(names("cart", {}), ["cart"]);
  });
});
