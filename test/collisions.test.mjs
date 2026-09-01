/**
 * The collision check is the other piece of inference in this dashboard, and the real
 * store has no overlap — so on live data it returns an empty list whether it works or
 * not. These build stores that do overlap.
 *
 * Getting it wrong is expensive in a specific way: the hazard it warns about never
 * appears as a git conflict, so a silent false negative means the first anyone hears of
 * it is a MODIFIED block that no longer matches its baseline at archive time.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { collisions, deltasInDevelopment } from "../server/catalog.mjs";

let store;

/** Write one change's delta on one capability. */
function delta(changeId, capability, heading) {
  const dir = join(store, "openspec", "changes", changeId, "specs", capability);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "spec.md"),
    [
      heading,
      "",
      "### Requirement: Something",
      "",
      "#### Scenario: A case",
      "",
      "WHEN x THEN y",
      "",
    ].join("\n"),
  );
}

beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-catalog-"));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe("collisions", () => {
  it("is empty when changes own separate capabilities", () => {
    delta("add-guest-checkout", "guest-checkout", "## ADDED Requirements");
    delta("add-back-in-stock-alerts", "stock-alerts", "## ADDED Requirements");
    assert.deepEqual(
      collisions(store, ["add-guest-checkout", "add-back-in-stock-alerts"]),
      [],
    );
  });

  it("names a capability two in-development changes both delta", () => {
    delta("add-guest-checkout", "cart", "## MODIFIED Requirements");
    delta("add-cart-limits", "cart", "## MODIFIED Requirements");

    const found = collisions(store, ["add-guest-checkout", "add-cart-limits"]);
    assert.equal(found.length, 1);
    assert.equal(found[0].capability, "cart");
    assert.deepEqual(found[0].changes.map((c) => c.change).sort(), [
      "add-cart-limits",
      "add-guest-checkout",
    ]);
  });

  it("reports which of the colliding changes rewrite the baseline", () => {
    // One rewrites shipped behavior, one only adds to the same capability. The MODIFIED
    // side is the one whose headers stop matching once the other archives.
    delta("rewrites", "cart", "## MODIFIED Requirements");
    delta("extends", "cart", "## ADDED Requirements");

    const [found] = collisions(store, ["rewrites", "extends"]);
    assert.deepEqual(found.modifies, ["rewrites"]);
  });

  it("does not flag a capability only one change touches, however many deltas", () => {
    delta("solo", "cart", "## MODIFIED Requirements");
    delta("solo", "guest-checkout", "## ADDED Requirements");
    assert.deepEqual(collisions(store, ["solo"]), []);
  });

  it("flags a three-way overlap once, listing every change", () => {
    for (const id of ["a", "b", "c"])
      delta(id, "cart", "## MODIFIED Requirements");

    const found = collisions(store, ["a", "b", "c"]);
    assert.equal(found.length, 1);
    assert.equal(found[0].changes.length, 3);
    assert.deepEqual(found[0].modifies, ["a", "b", "c"]);
  });

  it("ignores a change with no specs directory at all", () => {
    delta("has-specs", "cart", "## MODIFIED Requirements");
    mkdirSync(join(store, "openspec", "changes", "still-planning"), {
      recursive: true,
    });
    assert.deepEqual(collisions(store, ["has-specs", "still-planning"]), []);
  });
});

/**
 * The catalog marks a row contested by counting its own in-development deltas rather than
 * calling `collisions()` — the same fact, reached two ways, and the whole point of not
 * walking the store twice is lost if the two ever answer differently. The board's tile and
 * the catalog's chip would then disagree about the same capability, with nothing to say
 * which was right.
 */
describe("contested capabilities match the collision check", () => {
  const contested = (ids) =>
    [...deltasInDevelopment(store, ids)]
      .filter(([, deltas]) => deltas.length > 1)
      .map(([capability]) => capability)
      .sort();

  const collided = (ids) =>
    collisions(store, ids)
      .map((c) => c.capability)
      .sort();

  it("agree on a store where two changes overlap", () => {
    delta("rewrites", "cart", "## MODIFIED Requirements");
    delta("extends", "cart", "## ADDED Requirements");
    delta("solo", "guest-checkout", "## ADDED Requirements");

    const ids = ["rewrites", "extends", "solo"];
    assert.deepEqual(contested(ids), ["cart"]);
    assert.deepEqual(contested(ids), collided(ids));
  });

  it("agree on a store with nothing overlapping", () => {
    delta("a", "cart", "## ADDED Requirements");
    delta("b", "guest-checkout", "## ADDED Requirements");

    assert.deepEqual(contested(["a", "b"]), []);
    assert.deepEqual(contested(["a", "b"]), collided(["a", "b"]));
  });

  it("agree on a three-way overlap", () => {
    for (const id of ["a", "b", "c"])
      delta(id, "cart", "## MODIFIED Requirements");

    assert.deepEqual(contested(["a", "b", "c"]), collided(["a", "b", "c"]));
  });
});
