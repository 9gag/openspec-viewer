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
      tab: null,
    });
  });

  it("decodes an argument that carries a path", () => {
    // A capability is `storefront/checkout`, and the slash inside it would otherwise be
    // read as the boundary between the view and its argument.
    assert.deepEqual(routeFrom(href("spec", "storefront/checkout")), {
      view: "spec",
      arg: "storefront/checkout",
      tab: null,
    });
  });

  it("opens the board for an empty hash", () => {
    assert.deepEqual(routeFrom(""), { view: "board", arg: null, tab: null });
    assert.deepEqual(routeFrom("#"), { view: "board", arg: null, tab: null });
    assert.deepEqual(routeFrom("#/"), { view: "board", arg: null, tab: null });
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
    for (const [view, arg, tab] of [
      ["board", undefined, undefined],
      ["change", "add-guest-checkout", undefined],
      ["change", "add-guest-checkout", "tasks"],
      ["change", "add-guest-checkout", "user-journeys"],
      ["spec", "shared/ui/cart", undefined],
      ["spec", "shared/ui/cart", "test-cases"],
      ["namespace", "storefront", undefined],
      ["search", "a phrase with spaces", undefined],
      ["doc", "docs/prds/checkout.md", undefined],
    ]) {
      assert.deepEqual(routeFrom(href(view, arg, tab)), {
        view,
        arg: arg ?? null,
        tab: tab ?? null,
      });
    }
  });
});

/**
 * The tab is the third segment, and it is a segment rather than a query so that leaving the
 * page takes it with it: the tab a reader left one change on must not decide which document
 * the next change opens on, and two changes need not even carry the same artifacts.
 */
describe("routeFrom, the tab", () => {
  it("reads which document of a change is open", () => {
    assert.deepEqual(routeFrom("#/change/add-guest-checkout/tasks"), {
      view: "change",
      arg: "add-guest-checkout",
      tab: "tasks",
    });
  });

  it("keeps a capability's own slashes out of it", () => {
    // The argument is encoded whole, so the tab is the segment after it however many
    // levels deep the capability is filed.
    assert.deepEqual(routeFrom(href("spec", "storefront/checkout", "notes")), {
      view: "spec",
      arg: "storefront/checkout",
      tab: "notes",
    });
  });

  it("is null on a route that names no tab", () => {
    assert.equal(routeFrom("#/change/add-guest-checkout").tab, null);
  });

  it("is not written for a view with no argument to hang it on", () => {
    // `#/board//tasks` names nothing: a tab belongs to the page an argument identifies.
    assert.equal(href("board", undefined, "tasks"), "#/board");
  });
});
