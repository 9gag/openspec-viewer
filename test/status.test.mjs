/**
 * The join between the catalogue and the board: whether a capability's in-development
 * history still points at something the board can show progress for.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ownersOf, statusRows } from "../src/status.js";

/** One capability, as capabilityCatalog() would hand it to the view. */
function cap(capability, { state = "shipped", history = [] } = {}) {
  return {
    capability,
    state,
    shipped: state === "shipped",
    inDevelopment: history.filter((h) => !h.archived).length,
    history,
  };
}

/** One entry in a capability's history, as capabilityCatalog() records it. */
function delta(change, kinds, archived = false) {
  return {
    change,
    changeId: change,
    kinds,
    archived,
    at: null,
    archivedOn: null,
  };
}

/** One change, as board() would hand it to the view. */
function change(id, overrides = {}) {
  return { id, planning: false, done: 0, total: 1, groups: [], ...overrides };
}

describe("statusRows", () => {
  it("gives an untouched capability no touching entries", () => {
    const [row] = statusRows([cap("checkout")], []);
    assert.deepEqual(row.touching, []);
  });

  it("resolves a capability's one touching change against the board", () => {
    const specs = [
      cap("checkout", {
        state: "unshipped",
        history: [delta("add-checkout", ["ADDED"])],
      }),
    ];
    const changes = [change("add-checkout", { done: 2, total: 5 })];

    const [row] = statusRows(specs, changes);
    assert.equal(row.touching.length, 1);
    assert.equal(row.touching[0].change, changes[0]);
  });

  it("resolves both changes on a contested capability", () => {
    const specs = [
      cap("checkout", {
        state: "shipped",
        history: [
          delta("add-guest-checkout", ["MODIFIED"]),
          delta("add-express-checkout", ["MODIFIED"]),
        ],
      }),
    ];
    const changes = [change("add-guest-checkout"), change("add-express-checkout")];

    const [row] = statusRows(specs, changes);
    assert.equal(row.touching.length, 2);
    assert.deepEqual(
      row.touching.map((t) => t.change.id).sort(),
      ["add-express-checkout", "add-guest-checkout"],
    );
  });

  it("keeps a touching entry on a capability currently being retired", () => {
    const specs = [
      cap("legacy-cart", {
        state: "retired",
        history: [delta("remove-legacy-cart", ["REMOVED"])],
      }),
    ];
    const changes = [change("remove-legacy-cart")];

    const [row] = statusRows(specs, changes);
    assert.equal(row.state, "retired");
    assert.equal(row.touching.length, 1);
  });

  it("leaves the change null when the board does not carry it", () => {
    const specs = [
      cap("checkout", {
        state: "unshipped",
        history: [delta("add-checkout", ["ADDED"])],
      }),
    ];

    const [row] = statusRows(specs, []);
    assert.equal(row.touching.length, 1);
    assert.equal(row.touching[0].change, null);
  });

  it("drops archived deltas from touching — they are not in-flight", () => {
    const specs = [
      cap("checkout", {
        state: "shipped",
        history: [delta("add-checkout", ["ADDED"], true)],
      }),
    ];

    const [row] = statusRows(specs, []);
    assert.deepEqual(row.touching, []);
  });
});

describe("ownersOf", () => {
  it("dedupes owners across groups", () => {
    const owners = ownersOf(
      change("add-checkout", {
        groups: [{ owner: "alice" }, { owner: "alice" }, { owner: "bob" }],
      }),
    );
    assert.deepEqual(owners.sort(), ["alice", "bob"]);
  });

  it("drops unassigned groups", () => {
    assert.deepEqual(
      ownersOf(change("add-checkout", { groups: [{ owner: null }] })),
      [],
    );
  });

  it("is empty for a change with no groups", () => {
    assert.deepEqual(ownersOf(change("add-checkout")), []);
  });
});
