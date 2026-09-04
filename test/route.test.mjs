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
import { absoluteLink, headingLink, withPosition } from "../src/toc.js";

/** The position half of a route that names none, spelled once. */
const nowhere = { to: null, at: null };

describe("routeFrom", () => {
  it("reads the view and its argument", () => {
    assert.deepEqual(routeFrom("#/change/add-guest-checkout"), {
      view: "change",
      arg: "add-guest-checkout",
      tab: null,
      position: nowhere,
    });
  });

  it("decodes an argument that carries a path", () => {
    // A capability is `storefront/checkout`, and the slash inside it would otherwise be
    // read as the boundary between the view and its argument.
    assert.deepEqual(routeFrom(href("spec", "storefront/checkout")), {
      view: "spec",
      arg: "storefront/checkout",
      tab: null,
      position: nowhere,
    });
  });

  it("opens the board for an empty hash", () => {
    const board = { view: "board", arg: null, tab: null, position: nowhere };
    assert.deepEqual(routeFrom(""), board);
    assert.deepEqual(routeFrom("#"), board);
    assert.deepEqual(routeFrom("#/"), board);
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
        position: nowhere,
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
      position: nowhere,
    });
  });

  it("keeps a capability's own slashes out of it", () => {
    // The argument is encoded whole, so the tab is the segment after it however many
    // levels deep the capability is filed.
    assert.deepEqual(routeFrom(href("spec", "storefront/checkout", "notes")), {
      view: "spec",
      arg: "storefront/checkout",
      tab: "notes",
      position: nowhere,
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

/**
 * The position rides in the fragment, after the route, so the two move as one string. What
 * that costs is a parse: the route half has to come back out of an address that now carries
 * something else, and it has to come back out identical.
 */
describe("routeFrom, the position", () => {
  it("reads the heading a link named", () => {
    assert.deepEqual(routeFrom("#/spec/storefront%2Fcheckout?to=purpose"), {
      view: "spec",
      arg: "storefront/checkout",
      tab: null,
      position: { to: "purpose", at: null },
    });
  });

  it("reads the scenario a citation named, tab and all", () => {
    assert.deepEqual(
      routeFrom("#/change/add-guest-checkout/specs?at=store-cart-SC-01"),
      {
        view: "change",
        arg: "add-guest-checkout",
        tab: "specs",
        position: { to: null, at: "store-cart-SC-01" },
      },
    );
  });

  it("leaves the route it is attached to exactly as it was", () => {
    // The whole contract in one line: a position may be added to any address without
    // changing where that address goes.
    for (const route of [
      "#/board",
      "#/change/add-guest-checkout",
      "#/change/add-guest-checkout/tasks",
      href("spec", "storefront/checkout", "notes"),
      href("search", "a phrase with spaces"),
      href("doc", "docs/prds/checkout.md"),
    ]) {
      const { position, ...bare } = routeFrom(route);
      const { position: _, ...withOne } = routeFrom(
        withPosition(route, "to", "purpose"),
      );
      assert.deepEqual(withOne, bare, route);
    }
  });

  it("does not split on a question mark inside the argument", () => {
    // Nothing in a store is named this way, but a directory name is not the viewer's to
    // constrain — and `encodeURIComponent` is what makes it safe, so pin that it is.
    const route = href("doc", "docs/why?.md");
    assert.ok(route.includes("%3F"));
    assert.equal(routeFrom(route).arg, "docs/why?.md");
    assert.equal(
      routeFrom(withPosition(route, "to", "purpose")).arg,
      "docs/why?.md",
    );
  });

  it("round-trips an id that needs encoding", () => {
    const link = headingLink(
      "a heading with spaces",
      "#/change/guest-checkout",
    );
    assert.equal(routeFrom(link).position.to, "a heading with spaces");
    assert.equal(routeFrom(link).arg, "guest-checkout");
  });

  it("is no position when the key is there but empty", () => {
    // `?to=` is what a link to a heading with no anchor would have been. Reading it as a
    // position sends the page hunting for an element with no id; reading it as none opens
    // the document at the top, which is where that link was always going to land.
    assert.deepEqual(routeFrom("#/spec/storefront%2Fcheckout?to=").position, {
      to: null,
      at: null,
    });
  });

  it("is not a route when a position has no page under it", () => {
    // `#?to=purpose` names somewhere inside a document without saying which document. The
    // anchor reading is the safe one, as it is for `#purpose`: leave the reader on what
    // they are reading rather than navigate them away from it.
    assert.equal(routeFrom("#?to=purpose"), null);
    assert.equal(routeFrom("#?at=store-cart-SC-01"), null);
  });
});

/**
 * What a navigation carries and what it drops.
 *
 * The two halves of the address answer different questions and outlive each other by
 * different rules: the fragment says which page and where in it, and is replaced whole on
 * every navigation; the query says how the store is being read, and lasts the visit. The
 * old arrangement mixed them, and needed a rule and a `replaceState` to unmix them again.
 */
describe("a navigation", () => {
  it("leaves the position behind with the page it named", () => {
    // Nothing enforces this. Following a nav entry writes the fragment, and the position
    // was inside it.
    assert.deepEqual(routeFrom(href("board")).position, { to: null, at: null });
    assert.deepEqual(routeFrom(href("change", "add-guest-checkout")).position, {
      to: null,
      at: null,
    });
  });

  it("keeps a position the link wrote for itself", () => {
    // A citation is one address carrying both halves, so there is nothing to tell apart:
    // whatever the fragment says is what the reader asked for.
    const citation = withPosition(
      href("change", "add-guest-checkout", "specs"),
      "at",
      "store-cart-SC-01",
    );
    assert.equal(routeFrom(citation).position.at, "store-cart-SC-01");
    assert.equal(routeFrom(citation).tab, "specs");
  });

  it("cannot touch the reading, which is in the other half", () => {
    // `?mode=`, `?board=` and `?filter=` are about the visit rather than about a page.
    // Nothing the router writes is a query, so there is no path by which they are lost.
    for (const route of [href("board"), href("spec", "storefront/checkout")])
      assert.equal(route.includes("?"), false, route);

    const at = {
      origin: "http://localhost:5175",
      pathname: "/",
      search: "?board=simple&mode=dark",
      hash: href("change", "add-guest-checkout"),
    };
    assert.equal(
      absoluteLink(headingLink("why", at.hash), at),
      "http://localhost:5175/?board=simple&mode=dark#/change/add-guest-checkout?to=why",
    );
  });
});
