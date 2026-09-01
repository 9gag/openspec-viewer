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
 * collisions.test.mjs.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilityState } from "../server/catalog.mjs";

/** One delta on a capability, as capabilityCatalog() records it. */
function archived(kinds, on, at = Date.parse(on)) {
  return { change: `${on}-a-change`, kinds, archived: true, at, archivedOn: on };
}

function inDevelopment(kinds, at = Date.parse("2026-08-30")) {
  return { change: "a-change", kinds, archived: false, at, archivedOn: null };
}

describe("capabilityState", () => {
  it("is shipped whenever there is a baseline, whatever the deltas say", () => {
    assert.equal(
      capabilityState({ shipped: true, history: [archived(["ADDED"], "2026-08-01")] }),
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
