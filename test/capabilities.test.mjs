/**
 * How the catalog arranges itself.
 *
 * The grouping is the change: a store writes its namespaces into the capability paths and
 * the index used to sort them away. The cases worth holding down are the ones where the
 * rule has to decide something — a nested namespace, a store with no namespaces at all,
 * and where the capabilities that have none go.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  capabilityFlag,
  capabilityTreeByNamespace,
  changeTreeByNamespace,
  groupByNamespace,
  isCurrent,
  leafOf,
  namespaceOf,
  NO_CAPABILITY,
  summarise,
  TOP_LEVEL,
} from "../src/capabilities.js";

/** One catalog entry, as /api/specs returns it. */
const cap = (capability, extra = {}) => ({
  capability,
  state: "shipped",
  inFlight: 0,
  ...extra,
});

const names = (groups) =>
  groups.map((g) => [g.name, g.caps.map((c) => c.capability)]);

describe("namespaceOf", () => {
  it("is everything before the last slash", () => {
    assert.equal(namespaceOf("shared-ui/cart"), "shared-ui");
  });

  // specDirs walks as deep as the store nests, so the namespace has to as well —
  // grouping admin/console/user-directory under "admin" would put it beside capabilities
  // it shares nothing with.
  it("keeps every level of a nested path", () => {
    assert.equal(namespaceOf("admin/console/user-directory"), "admin/console");
  });

  it("is null for a capability that has none", () => {
    assert.equal(namespaceOf("date-formats"), null);
  });
});

describe("leafOf", () => {
  it("drops what the heading already says", () => {
    assert.equal(leafOf("shared-ui/cart"), "cart");
    assert.equal(leafOf("admin/console/user-directory"), "user-directory");
  });

  it("is the whole name when there is no namespace", () => {
    assert.equal(leafOf("date-formats"), "date-formats");
  });
});

describe("groupByNamespace", () => {
  it("collects a namespace and sorts its rows by the leaf", () => {
    assert.deepEqual(
      names(groupByNamespace([cap("shared-ui/home"), cap("shared-ui/cart")])),
      [["shared-ui", ["shared-ui/cart", "shared-ui/home"]]],
    );
  });

  it("orders named namespaces alphabetically", () => {
    const groups = groupByNamespace([
      cap("shared-ui/cart"),
      cap("admin/user-directory"),
      cap("storefront/home"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.name),
      ["admin", "shared-ui", "storefront"],
    );
  });

  // A cross-cutting convention belongs to everything, so it reads last rather than
  // sorting into the middle of the domains under some letter.
  it("puts capabilities with no namespace last", () => {
    const groups = groupByNamespace([
      cap("date-formats"),
      cap("shared-ui/cart"),
      cap("admin/user-directory"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.name),
      ["admin", "shared-ui", TOP_LEVEL],
    );
  });

  it("titles every group when the store namespaces anything at all", () => {
    const groups = groupByNamespace([
      cap("date-formats"),
      cap("shared-ui/cart"),
    ]);
    assert.deepEqual(
      groups.map((g) => g.titled),
      [true, true],
    );
  });

  // One heading over the whole page labels the page, not a group within it.
  it("drops the heading when nothing in the store is namespaced", () => {
    const groups = groupByNamespace([
      cap("money-formats"),
      cap("date-formats"),
    ]);
    assert.equal(groups.length, 1);
    assert.equal(groups[0].titled, false);
    assert.deepEqual(
      groups[0].caps.map((c) => c.capability),
      ["date-formats", "money-formats"],
    );
  });

  it("has nothing to group in an empty store", () => {
    assert.deepEqual(groupByNamespace([]), []);
  });

  it("leaves the list it was given alone", () => {
    const caps = [cap("shared-ui/home"), cap("shared-ui/stock-alerts")];
    groupByNamespace(caps);
    assert.deepEqual(
      caps.map((c) => c.capability),
      ["shared-ui/home", "shared-ui/stock-alerts"],
    );
  });
});

describe("summarise", () => {
  it("counts every state the store is in", () => {
    const counts = summarise([
      cap("a/one"),
      cap("a/two"),
      cap("a/three", { state: "unshipped", inFlight: 1 }),
      cap("a/four", { state: "retired" }),
      cap("a/five", { state: "shipped", inFlight: 2 }),
    ]);
    assert.deepEqual(counts, {
      total: 5,
      shipped: 3,
      unshipped: 1,
      retired: 1,
      contested: 1,
    });
  });

  // A single in-flight change is not a hazard — it is the ordinary way work arrives.
  it("does not count one in-flight change as contested", () => {
    const counts = summarise([cap("a/one", { inFlight: 1 })]);
    assert.equal(counts.contested, 0);
  });

  it("reports zero for the states a store is not in", () => {
    const counts = summarise([cap("a/one")]);
    assert.equal(counts.retired, 0);
    assert.equal(counts.contested, 0);
  });
});

describe("changeTreeByNamespace", () => {
  /** One in-flight change, as /api/board returns it. */
  const change = (id, capabilities = []) => ({ id, capabilities });

  /** A node as `name (count) [changes] {children}`, so a whole tree fits an assertion. */
  const shape = (nodes) =>
    nodes.map((n) => [
      n.name,
      n.count,
      n.items.map((c) => c.id),
      shape(n.children),
    ]);

  it("files a change under the namespace it deltas", () => {
    assert.deepEqual(
      shape(
        changeTreeByNamespace([
          change("add-watchlist", ["checkout/watchlist"]),
        ]),
      ),
      [["checkout", 1, ["add-watchlist"], []]],
    );
  });

  // The whole point of the tree: two namespaces under one product read as that product,
  // rather than as two strings that happen to start the same way.
  it("nests a namespace under the one it is inside", () => {
    assert.deepEqual(
      shape(
        changeTreeByNamespace([
          change("add-close-out", ["admin/auction/close"]),
          change("add-stock-count", ["admin/inventory/stock"]),
        ]),
      ),
      [
        [
          "admin",
          2,
          [],
          [
            ["auction", 1, ["add-close-out"], []],
            ["inventory", 1, ["add-stock-count"], []],
          ],
        ],
      ],
    );
  });

  // A level that holds one namespace and nothing else says nothing the level under it
  // does not, and costs an indent to say it.
  it("collapses a namespace that only ever holds one other", () => {
    assert.deepEqual(
      shape(changeTreeByNamespace([change("add-pay", ["site/auction/pay"])])),
      [["site/auction", 1, ["add-pay"], []]],
    );
  });

  it("keeps its own changes when a namespace also holds namespaces", () => {
    assert.deepEqual(
      shape(
        changeTreeByNamespace([
          change("add-policy", ["shared/policy"]),
          change("add-cart", ["shared/ui/cart"]),
        ]),
      ),
      [["shared", 2, ["add-policy"], [["ui", 1, ["add-cart"], []]]]],
    );
  });

  // The nav is for finding a change from the area you have in mind, and a change that
  // rewrites shared-ui is shared-ui work however much checkout work it also does.
  it("lists a change touching two namespaces under both", () => {
    assert.deepEqual(
      shape(
        changeTreeByNamespace([
          change("add-order-record", [
            "checkout/order-record",
            "checkout/guest-checkout",
            "shared-ui/order-record",
          ]),
        ]),
      ),
      [
        ["checkout", 1, ["add-order-record"], []],
        ["shared-ui", 1, ["add-order-record"], []],
      ],
    );
  });

  it("counts a namespace once however many of its capabilities a change deltas", () => {
    const [checkout] = changeTreeByNamespace([
      change("add-admin-campaigns", [
        "checkout/campaign",
        "checkout/order-listing",
      ]),
    ]);
    assert.equal(checkout.items.length, 1);
    assert.equal(checkout.count, 1);
  });

  // Adding the children's counts would say two, and a parent that double-counts a change
  // is a number nobody can reconcile with the rows under it.
  it("counts a change once for a parent it reaches by two paths", () => {
    const [shared] = changeTreeByNamespace([
      change("restyle-cart", ["shared/ui/cart", "shared/design-sync/tokens"]),
    ]);
    assert.equal(shared.count, 1);
    assert.deepEqual(
      shared.children.map((c) => c.name),
      ["design-sync", "ui"],
    );
  });

  it("orders named namespaces first, then top level, then the undeclared", () => {
    const tree = changeTreeByNamespace([
      change("still-planning"),
      change("consolidate-dates", ["date-formats"]),
      change("sign-in-dialog-shell", ["shared-ui/sign-in"]),
      change("add-inventory", ["inventory/stock"]),
    ]);
    assert.deepEqual(
      tree.map((n) => n.name),
      ["inventory", "shared-ui", TOP_LEVEL, NO_CAPABILITY],
    );
  });

  // A change with no specs directory yet is normal early on, and the payload sends an
  // empty list rather than omitting the field — but neither should land it nowhere.
  it("keeps a change that deltas nothing yet", () => {
    assert.deepEqual(
      shape(changeTreeByNamespace([change("still-planning"), { id: "bare" }])),
      [[NO_CAPABILITY, 2, ["bare", "still-planning"], []]],
    );
  });

  it("sorts changes within a namespace by id", () => {
    const [node] = changeTreeByNamespace([
      change("revise-pricing", ["storefront/pricing"]),
      change("add-payments", ["storefront/payments"]),
    ]);
    assert.deepEqual(
      node.items.map((c) => c.id),
      ["add-payments", "revise-pricing"],
    );
  });

  it("has nothing to group when no change is in flight", () => {
    assert.deepEqual(changeTreeByNamespace([]), []);
  });
});

describe("capabilityTreeByNamespace", () => {
  const cap = (capability, extra = {}) => ({
    capability,
    state: "shipped",
    inFlight: 0,
    ...extra,
  });

  const shape = (nodes) =>
    nodes.map((n) => [
      n.name,
      n.count,
      n.items.map((c) => c.capability),
      shape(n.children),
    ]);

  it("nests a capability under every level of its namespace", () => {
    assert.deepEqual(
      shape(
        capabilityTreeByNamespace([
          cap("site/auction/listing-page"),
          cap("site/store/home"),
        ]),
      ),
      [
        [
          "site",
          2,
          [],
          [
            ["auction", 1, ["site/auction/listing-page"], []],
            ["store", 1, ["site/store/home"], []],
          ],
        ],
      ],
    );
  });

  it("keeps a namespace's own capabilities above the namespaces in it", () => {
    const [shared] = capabilityTreeByNamespace([
      cap("shared/ui/cart"),
      cap("shared/money-amounts"),
    ]);
    assert.deepEqual(
      shared.items.map((c) => c.capability),
      ["shared/money-amounts"],
    );
    assert.deepEqual(
      shared.children.map((c) => c.name),
      ["ui"],
    );
    assert.equal(shared.count, 2);
  });

  // The same rule the change tree follows: a level holding one namespace and nothing else
  // says nothing the level under it does not.
  it("collapses a namespace that only ever holds one other", () => {
    assert.deepEqual(
      shape(capabilityTreeByNamespace([cap("site/auction/listing-page")])),
      [["site/auction", 1, ["site/auction/listing-page"], []]],
    );
  });

  it("puts a capability with no namespace under top level, last", () => {
    const tree = capabilityTreeByNamespace([
      cap("dates-and-times"),
      cap("site/store/home"),
    ]);
    assert.deepEqual(
      tree.map((n) => n.name),
      ["site/store", TOP_LEVEL],
    );
  });

  it("has nothing to group in an empty store", () => {
    assert.deepEqual(capabilityTreeByNamespace([]), []);
  });
});

/**
 * The nav marks a capability only when there is something to say about it — the same
 * rule the status strip is built on, and the reason three quarters of the tree is quiet.
 */
describe("capabilityFlag", () => {
  const cap = (extra) => ({
    capability: "a/b",
    state: "shipped",
    inFlight: 0,
    ...extra,
  });

  it("says nothing about a shipped capability nobody is rewriting", () => {
    assert.equal(capabilityFlag(cap({})), null);
  });

  it("marks a capability a change is rewriting", () => {
    assert.deepEqual(capabilityFlag(cap({ inFlight: 1 })), {
      variant: "accent",
      label: "in flight",
    });
  });

  // Two changes deltaing one capability is the collision the board warns about.
  it("counts the changes when more than one is rewriting it", () => {
    assert.deepEqual(capabilityFlag(cap({ inFlight: 2 })), {
      variant: "warning",
      label: "2 in flight",
    });
  });

  it("puts the rewrite ahead of the state, since that is what is about to change", () => {
    assert.equal(
      capabilityFlag(cap({ state: "unshipped", inFlight: 1 })).label,
      "in flight",
    );
  });

  it("names the states that are not shipped when nothing is in flight", () => {
    assert.equal(capabilityFlag(cap({ state: "retired" })).label, "retired");
    assert.equal(
      capabilityFlag(cap({ state: "unshipped" })).label,
      "no baseline",
    );
  });
});

/**
 * What the nav carries. The catalogue holds every capability any change ever named, and
 * a store that renames its taxonomy leaves the old paths in the archived deltas that
 * named them — rows with no spec to open and no change bringing one.
 */
describe("isCurrent", () => {
  const cap = (extra) => ({
    capability: "a/b",
    shipped: false,
    inFlight: 0,
    ...extra,
  });

  it("keeps a capability with a baseline to read", () => {
    assert.equal(isCurrent(cap({ shipped: true })), true);
  });

  it("keeps one a change is bringing in, baseline or not", () => {
    assert.equal(isCurrent(cap({ inFlight: 1 })), true);
    assert.equal(isCurrent(cap({ shipped: true, inFlight: 2 })), true);
  });

  // The renamed-away path: archived changes still name it, nothing else does.
  it("drops one only an archived change ever named", () => {
    assert.equal(isCurrent(cap({})), false);
  });
});
