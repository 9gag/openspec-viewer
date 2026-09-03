/**
 * A URL has one fragment and this app spends it on the route, so the route and an in-page
 * anchor arrive through the same door.
 *
 * Read by position alone, an anchor becomes a view — and a view nothing renders is a blank
 * page under a nav that still works, which reads as the tool being broken rather than as a
 * link being wrong. The outline rail beside every artifact emits exactly those anchors, so
 * this is reachable from the page's own furniture.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { href, routeFrom } from "../src/api.js";

describe("routeFrom", () => {
  it("reads the view and its argument", () => {
    assert.deepEqual(routeFrom("#/change/add-guest-checkout"), {
      view: "change",
      arg: "add-guest-checkout",
    });
  });

  it("decodes an argument that carries a path", () => {
    // A capability is `storefront/checkout`, and the slash inside it would otherwise be
    // read as the boundary between the view and its argument.
    assert.deepEqual(routeFrom(href("spec", "storefront/checkout")), {
      view: "spec",
      arg: "storefront/checkout",
    });
  });

  it("opens the board for an empty hash", () => {
    assert.deepEqual(routeFrom(""), { view: "board", arg: null });
    assert.deepEqual(routeFrom("#"), { view: "board", arg: null });
    assert.deepEqual(routeFrom("#/"), { view: "board", arg: null });
  });

  it("is not a route when the hash is an anchor on the page", () => {
    // This is the whole point. Every route this app writes starts with a slash and no
    // anchor does, because an anchor is a slug of a heading.
    assert.equal(
      routeFrom("#tech-design--3-one-temporary-impact-contract"),
      null,
    );
    assert.equal(routeFrom("#purpose"), null);
  });

  it("is not a route for a bare word that happens to name one", () => {
    // `#board` is a heading called "Board" as readily as it is the board, and the anchor
    // reading is the safe one: it leaves the view alone rather than navigating away from
    // whatever the reader was reading.
    assert.equal(routeFrom("#board"), null);
  });

  it("round-trips everything href writes", () => {
    // The two have to agree, and nothing else executes them together.
    for (const [view, arg] of [
      ["board", undefined],
      ["change", "add-guest-checkout"],
      ["spec", "shared/ui/cart"],
      ["namespace", "storefront"],
      ["search", "a phrase with spaces"],
      ["doc", "docs/prds/checkout.md"],
    ]) {
      assert.deepEqual(routeFrom(href(view, arg)), {
        view,
        arg: arg ?? null,
      });
    }
  });
});
