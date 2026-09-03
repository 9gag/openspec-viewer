/**
 * The third capability state.
 *
 * Shipped is read off disk and cannot be wrong. Retired is inferred, and it is the kind of
 * inference that is worse than silence when it misfires: calling live work "retired" hides
 * it, and calling withdrawn behavior "in development" points a reader at work nobody is doing.
 * So the cases here are mostly the ones where a REMOVED appears and the answer is still
 * not retired.
 *
 * `capabilityState` is pure over the entry the catalog has already built, so none of this
 * needs a store on disk — the store-backed half of the catalog is covered in
 * conflicts.test.mjs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilityState, shippedAt, shippedOn } from "../server/catalog.mjs";

/** One delta on a capability, as capabilityCatalog() records it. */
function archived(kinds, on, at = Date.parse(on)) {
  return {
    change: `${on}-a-change`,
    kinds,
    archived: true,
    at,
    archivedOn: on,
  };
}

function inDevelopment(kinds, at = Date.parse("2026-08-30")) {
  return { change: "a-change", kinds, archived: false, at, archivedOn: null };
}

describe("capabilityState", () => {
  it("is shipped whenever there is a baseline, whatever the deltas say", () => {
    assert.equal(
      capabilityState({
        shipped: true,
        history: [archived(["ADDED"], "2026-08-01")],
      }),
      "shipped",
    );
  });

  it("is unshipped for a capability a change is still bringing in", () => {
    assert.equal(
      capabilityState({ shipped: false, history: [inDevelopment(["ADDED"])] }),
      "unshipped",
    );
  });

  it("is retired when the newest delta did nothing but remove", () => {
    assert.equal(
      capabilityState({
        shipped: false,
        history: [
          archived(["REMOVED"], "2026-08-29"),
          archived(["ADDED"], "2026-08-28"),
        ],
      }),
      "retired",
    );
  });

  it("is unshipped again once a later change re-adds it", () => {
    assert.equal(
      capabilityState({
        shipped: false,
        history: [
          archived(["ADDED"], "2026-08-30"),
          archived(["REMOVED"], "2026-08-29"),
        ],
      }),
      "unshipped",
    );
  });

  // A change that both adds and removes is rewriting the capability, not withdrawing it.
  it("is unshipped when the newest delta removes and adds", () => {
    assert.equal(
      capabilityState({
        shipped: false,
        history: [archived(["ADDED", "REMOVED"], "2026-08-29")],
      }),
      "unshipped",
    );
  });

  // The archive dropping requirements from a capability that still has a baseline is an
  // ordinary edit; only the missing baseline makes a removal a withdrawal.
  it("is shipped when a REMOVED delta leaves the baseline standing", () => {
    assert.equal(
      capabilityState({
        shipped: true,
        history: [archived(["REMOVED"], "2026-08-29")],
      }),
      "shipped",
    );
  });

  // RENAMED leaves the old name in a state the store does not describe. Guessing would be
  // the confidently-wrong inference; unshipped is the honest answer.
  it("is unshipped for a capability renamed away rather than removed", () => {
    assert.equal(
      capabilityState({
        shipped: false,
        history: [archived(["RENAMED"], "2026-08-29")],
      }),
      "unshipped",
    );
  });

  it("is unshipped for a capability nothing has ever touched", () => {
    assert.equal(capabilityState({ shipped: false, history: [] }), "unshipped");
  });

  describe("ordering the deltas", () => {
    // The state of a store nobody has committed. Every `at` is null, so the archive
    // directory's date prefix is the only thing left to order by.
    it("falls back to the archive date when a store has no git history", () => {
      assert.equal(
        capabilityState({
          shipped: false,
          history: [
            archived(["ADDED"], "2026-08-28", null),
            archived(["REMOVED"], "2026-08-29", null),
          ],
        }),
        "retired",
      );
    });

    it("does not let readdir order decide it", () => {
      assert.equal(
        capabilityState({
          shipped: false,
          history: [
            archived(["REMOVED"], "2026-08-29", null),
            archived(["ADDED"], "2026-08-30", null),
          ],
        }),
        "unshipped",
      );
    });

    // An in-development change has not landed, so it is the newest thing that happened to the
    // capability even when the archive it sits beside carries a later commit date.
    it("puts an in-development delta ahead of every archived one", () => {
      assert.equal(
        capabilityState({
          shipped: false,
          history: [
            archived(["REMOVED"], "2026-08-29", Date.parse("2026-09-05")),
            inDevelopment(["ADDED"], Date.parse("2026-08-01")),
          ],
        }),
        "unshipped",
      );
    });

    it("reads an in-development removal as retired", () => {
      assert.equal(
        capabilityState({
          shipped: false,
          history: [
            inDevelopment(["REMOVED"]),
            archived(["ADDED"], "2026-08-20"),
          ],
        }),
        "retired",
      );
    });
  });
});

/**
 * When a shipped change shipped.
 *
 * The two answers disagree in the case that matters: a store whose archive arrived in one
 * import, or through a squash or a branch merged weeks later, has one commit date across
 * every change in it. Dating the archive from that turns a year of releases into a single
 * afternoon, and every row of the page reads the same day — which is exactly the state this
 * was found in.
 */
describe("shippedOn", () => {
  const commit = { at: Date.parse("2026-09-03T11:20:00") };

  it("takes the day from the archive directory's own name", () => {
    assert.equal(shippedOn("2026-08-26", commit), "2026-08-26");
  });

  it("falls back to the commit for a directory nobody dated", () => {
    assert.equal(shippedOn(null, commit), "2026-09-03");
  });

  it("is null when there is neither, rather than inventing a day", () => {
    assert.equal(shippedOn(null, null), null);
  });
});

describe("shippedAt", () => {
  it("orders by the day the directory names, not the commit holding it", () => {
    const older = { at: Date.parse("2026-09-03T11:20:00") };
    const newer = { at: Date.parse("2026-09-03T11:20:00") };
    assert.ok(shippedAt("2026-08-26", older) < shippedAt("2026-08-27", newer));
  });

  it("reads a date in the timezone it was stamped in", () => {
    // `openspec archive` writes the prefix from the clock of whoever ran it, so the day
    // is taken at local midnight — read as UTC it lands on the day before for anyone
    // west of it, and the archive page shows a change shipping the day before it did.
    assert.equal(
      shippedAt("2026-08-26", null),
      Date.parse("2026-08-26T00:00:00"),
    );
  });

  it("sorts a change with neither date nor commit last", () => {
    assert.equal(shippedAt(null, null), 0);
  });
});
