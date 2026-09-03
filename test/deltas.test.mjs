/**
 * The archive-time hazard the change page has always warned about, now checked.
 *
 * `openspec archive` swaps a requirement in the baseline for the one under a change's
 * `## MODIFIED Requirements`, matching them by the requirement's own heading line. A
 * heading that has drifted does not fail the fold — it lands as nothing, the baseline keeps
 * the requirement it had, and the rewrite is gone. Nothing in git has an opinion about it,
 * which is why a check is the only thing that catches it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { modifiedDrift, modifiedRequirements } from "../server/deltas.mjs";

const baseline = [
  "## Purpose",
  "Taking payment for a basket.",
  "",
  "## Requirements",
  "",
  "### Requirement: Cart totals",
  "The cart SHALL price a basket once.",
  "",
  "### Requirement: Guest checkout",
  "A shopper SHALL check out without an account.",
  "",
].join("\n");

const delta = (...lines) => lines.join("\n");

describe("modifiedRequirements", () => {
  it("reads only the requirements under MODIFIED", () => {
    // An ADDED requirement is not supposed to be in the baseline. Reading the whole delta
    // would report every one of them as drift, which is the check crying wolf on the
    // normal case.
    const text = delta(
      "## ADDED Requirements",
      "### Requirement: Split payment",
      "",
      "## MODIFIED Requirements",
      "### Requirement: Cart totals",
      "The cart SHALL price a basket once, including tax.",
    );

    assert.deepEqual(
      modifiedRequirements(text, baseline).map((r) => [r.title, r.inBaseline]),
      [["Cart totals", true]],
    );
  });

  it("stops the block at the next section", () => {
    const text = delta(
      "## MODIFIED Requirements",
      "### Requirement: Cart totals",
      "body",
      "",
      "## REMOVED Requirements",
      "### Requirement: Guest checkout",
    );

    assert.deepEqual(
      modifiedRequirements(text, baseline).map((r) => r.title),
      ["Cart totals"],
    );
  });
});

describe("modifiedDrift", () => {
  it("says nothing about a delta whose headings still match", () => {
    const text = delta(
      "## MODIFIED Requirements",
      "### Requirement: Cart totals",
      "rewritten",
    );
    assert.equal(modifiedDrift(text, baseline), null);
  });

  it("names the requirement the fold would miss", () => {
    // One character. That is the whole failure: to a reader these are the same
    // requirement, and to the archive they are two, so the rewrite lands nowhere.
    const text = delta(
      "## MODIFIED Requirements",
      "### Requirement: Cart total",
      "rewritten",
    );
    assert.deepEqual(modifiedDrift(text, baseline), {
      reason: "drift",
      requirements: ["Cart total"],
    });
  });

  it("does not cry wolf over whitespace", () => {
    // What the fold matches on is the CLI's business, not something to assert from out
    // here — so the comparison is the forgiving one. A banner raised over a double space
    // would be as ignorable as the unconditional one this replaced, and the failure it
    // exists for is a name that was reworded, which flattening whitespace cannot hide.
    const text = delta(
      "## MODIFIED Requirements",
      "### Requirement:  Cart   totals",
    );
    assert.equal(modifiedDrift(text, baseline), null);
  });

  it("reports a capability with no baseline as its own problem", () => {
    // Not drift: there is nothing to have drifted from. Either these requirements are new
    // and belong under ADDED, or the delta is filed under the wrong capability.
    const text = delta(
      "## MODIFIED Requirements",
      "### Requirement: Cart totals",
    );
    assert.deepEqual(modifiedDrift(text, null), {
      reason: "no-baseline",
      requirements: ["Cart totals"],
    });
  });

  it("says nothing about a delta that modifies nothing", () => {
    assert.equal(
      modifiedDrift(
        delta("## ADDED Requirements", "### Requirement: X"),
        baseline,
      ),
      null,
    );
    assert.equal(modifiedDrift("", baseline), null);
  });
});
