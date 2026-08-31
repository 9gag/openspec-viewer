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
  groupByNamespace,
  groupChangesByNamespace,
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
      names(
        groupByNamespace([
          cap("shared-ui/home"),
          cap("shared-ui/cart"),
        ]),
      ),
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

describe("groupChangesByNamespace", () => {
  /** One in-flight change, as /api/board returns it. */
  const change = (id, capabilities = []) => ({ id, capabilities });

  const shape = (groups) =>
    groups.map((g) => [g.name, g.changes.map((c) => c.id)]);

  it("files a change under the namespace it deltas", () => {
    assert.deepEqual(
      shape(
        groupChangesByNamespace([
          change("add-watchlist", ["checkout/watchlist"]),
        ]),
      ),
      [["checkout", ["add-watchlist"]]],
    );
  });

  // The nav is for finding a change from the area you have in mind, and a change that
  // rewrites shared-ui is shared-ui work however much checkout work it also does.
  it("lists a change touching two namespaces under both", () => {
    assert.deepEqual(
      shape(
        groupChangesByNamespace([
          change("add-order-record", [
            "checkout/order-record",
            "checkout/guest-checkout",
            "shared-ui/order-record",
          ]),
        ]),
      ),
      [
        ["checkout", ["add-order-record"]],
        ["shared-ui", ["add-order-record"]],
      ],
    );
  });

  it("counts a namespace once however many of its capabilities a change deltas", () => {
    const [checkout] = groupChangesByNamespace([
      change("add-admin-campaigns", [
        "checkout/campaign",
        "checkout/order-listing",
      ]),
    ]);
    assert.equal(checkout.changes.length, 1);
  });

  it("orders named namespaces first, then top level, then the undeclared", () => {
    const groups = groupChangesByNamespace([
      change("still-planning"),
      change("consolidate-dates", ["date-formats"]),
      change("sign-in-dialog-shell", ["shared-ui/sign-in"]),
      change("add-inventory", ["inventory/stock"]),
    ]);
    assert.deepEqual(
      groups.map((g) => g.name),
      ["inventory", "shared-ui", TOP_LEVEL, NO_CAPABILITY],
    );
  });

  // A change with no specs directory yet is normal early on, and the payload sends an
  // empty list rather than omitting the field — but neither should land it nowhere.
  it("keeps a change that deltas nothing yet", () => {
    assert.deepEqual(
      shape(groupChangesByNamespace([change("still-planning"), { id: "bare" }])),
      [[NO_CAPABILITY, ["bare", "still-planning"]]],
    );
  });

  it("sorts changes within a group by id", () => {
    const [group] = groupChangesByNamespace([
      change("revise-pricing", ["storefront/pricing"]),
      change("add-payments", ["storefront/payments"]),
    ]);
    assert.deepEqual(
      group.changes.map((c) => c.id),
      ["add-payments", "revise-pricing"],
    );
  });

  it("has nothing to group when no change is in flight", () => {
    assert.deepEqual(groupChangesByNamespace([]), []);
  });
});
