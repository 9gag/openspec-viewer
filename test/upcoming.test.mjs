/**
 * What a capability reads like with every in-development change on it folded on at once —
 * disjoint changes composing cleanly, and the same heading touched twice becoming a
 * disagreement instead of a guess at which one wins.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { deltasInDevelopment, upcomingFor } from "../server/catalog.mjs";
import { composeUpcoming } from "../server/upcoming.mjs";
import { changesTouching, resolveUpcoming } from "../src/upcoming.js";

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

const touchesOf = (entries, heading) =>
  entries.find((e) => e.heading === heading)?.touches ?? [];

describe("composeUpcoming", () => {
  it("folds two changes on disjoint requirements in cleanly", () => {
    const entries = composeUpcoming(baseline, [
      {
        changeId: "reprice-cart-totals",
        text: delta(
          "## MODIFIED Requirements",
          "### Requirement: Cart totals",
          "The cart SHALL price a basket once, including tax.",
        ),
      },
      {
        changeId: "add-split-payment",
        text: delta(
          "## ADDED Requirements",
          "### Requirement: Split payment",
          "A shopper SHALL split a basket's total across two cards.",
        ),
      },
    ]);

    assert.deepEqual(touchesOf(entries, "Cart totals"), [
      {
        changeId: "reprice-cart-totals",
        operation: "MODIFIED",
        text: "### Requirement: Cart totals\nThe cart SHALL price a basket once, including tax.",
      },
    ]);
    assert.deepEqual(touchesOf(entries, "Split payment"), [
      {
        changeId: "add-split-payment",
        operation: "ADDED",
        text: "### Requirement: Split payment\nA shopper SHALL split a basket's total across two cards.",
      },
    ]);
    // Guest checkout: baseline carries it, nothing in development touches it.
    const guest = entries.find((e) => e.heading === "Guest checkout");
    assert.equal(guest.baselineText.includes("check out without an account"), true);
    assert.deepEqual(guest.touches, []);
  });

  it("marks a disagreement when two changes both modify the same requirement", () => {
    const entries = composeUpcoming(baseline, [
      {
        changeId: "reprice-cart-totals",
        text: delta(
          "## MODIFIED Requirements",
          "### Requirement: Cart totals",
          "The cart SHALL price a basket once, including tax.",
        ),
      },
      {
        changeId: "round-cart-totals",
        text: delta(
          "## MODIFIED Requirements",
          "### Requirement: Cart totals",
          "The cart SHALL price a basket once, rounded to the nearest cent.",
        ),
      },
    ]);

    const touches = touchesOf(entries, "Cart totals");
    assert.equal(touches.length, 2);
    assert.deepEqual(
      touches.map((t) => t.changeId),
      ["reprice-cart-totals", "round-cart-totals"],
    );
  });

  it("marks a disagreement when two changes add the same heading", () => {
    const entries = composeUpcoming(baseline, [
      {
        changeId: "add-split-payment",
        text: delta(
          "## ADDED Requirements",
          "### Requirement: Split payment",
          "A shopper SHALL split a basket across two cards.",
        ),
      },
      {
        changeId: "add-split-payment-by-wallet",
        text: delta(
          "## ADDED Requirements",
          "### Requirement: Split payment",
          "A shopper SHALL split a basket across a card and a wallet balance.",
        ),
      },
    ]);

    assert.equal(
      entries.filter((e) => e.heading === "Split payment").length,
      1,
    );
    assert.equal(touchesOf(entries, "Split payment").length, 2);
  });

  it("marks a disagreement between a modify and a remove of the same requirement", () => {
    const entries = composeUpcoming(baseline, [
      {
        changeId: "reprice-cart-totals",
        text: delta(
          "## MODIFIED Requirements",
          "### Requirement: Cart totals",
          "The cart SHALL price a basket once, including tax.",
        ),
      },
      {
        changeId: "drop-cart-totals",
        text: delta(
          "## REMOVED Requirements",
          "### Requirement: Cart totals",
          "**Reason**: Pricing moves to the checkout capability.",
        ),
      },
    ]);

    const touches = touchesOf(entries, "Cart totals");
    assert.equal(touches.length, 2);
    assert.deepEqual(
      touches.map((t) => t.operation),
      ["MODIFIED", "REMOVED"],
    );
  });

  it("folds two ADDED-only changes onto an unshipped capability", () => {
    const entries = composeUpcoming(null, [
      {
        changeId: "add-split-payment",
        text: delta(
          "## ADDED Requirements",
          "### Requirement: Split payment",
          "A shopper SHALL split a basket across two cards.",
        ),
      },
      {
        changeId: "add-gift-cards",
        text: delta(
          "## ADDED Requirements",
          "### Requirement: Gift cards",
          "A shopper SHALL redeem a gift card against a basket.",
        ),
      },
    ]);

    assert.equal(entries.length, 2);
    for (const entry of entries) {
      assert.equal(entry.baselineText, null);
      assert.equal(entry.touches.length, 1);
    }
  });

  it("drops a MODIFIED block with no baseline to fold into", () => {
    const entries = composeUpcoming(null, [
      {
        changeId: "reprice-cart-totals",
        text: delta(
          "## MODIFIED Requirements",
          "### Requirement: Cart totals",
          "The cart SHALL price a basket once, including tax.",
        ),
      },
    ]);

    assert.deepEqual(entries, []);
  });

  it("leaves the baseline requirement in the composite when its own MODIFIED drifted", () => {
    const entries = composeUpcoming(baseline, [
      {
        changeId: "reprice-cart-total",
        text: delta(
          // One character off "Cart totals" — the same drift `modifiedDrift` already warns
          // the change page about.
          "## MODIFIED Requirements",
          "### Requirement: Cart total",
          "The cart SHALL price a basket once, including tax.",
        ),
      },
    ]);

    assert.deepEqual(touchesOf(entries, "Cart totals"), []);
    assert.equal(
      entries.some((e) => e.heading === "Cart total"),
      false,
    );
  });
});

/**
 * `upcomingFor` is the glue `capability()` calls: real in-development changes on disk,
 * read the same way `capabilities()` already reads them for the change page, folded
 * through `composeUpcoming` above.
 */
describe("upcomingFor", () => {
  let store;

  beforeEach(() => {
    store = mkdtempSync(join(tmpdir(), "openspec-viewer-upcoming-"));
  });
  afterEach(() => rmSync(store, { recursive: true, force: true }));

  function writeBaseline(capability, text) {
    const dir = join(store, "openspec", "specs", capability);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "spec.md"), text);
  }

  function writeDelta(changeId, capability, text) {
    const dir = join(store, "openspec", "changes", changeId, "specs", capability);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "spec.md"), text);
  }

  const historyFor = (ids, capability) =>
    deltasInDevelopment(store, ids).get(capability) ?? [];

  it("is null for a capability nothing in development touches", () => {
    writeBaseline("cart", baseline);
    assert.equal(upcomingFor(store, "cart", baseline, historyFor([], "cart")), null);
  });

  it("composes two in-development changes, one disjoint and one disagreeing", () => {
    writeBaseline("cart", baseline);
    writeDelta(
      "reprice-cart-totals",
      "cart",
      delta(
        "## MODIFIED Requirements",
        "### Requirement: Cart totals",
        "The cart SHALL price a basket once, including tax.",
      ),
    );
    writeDelta(
      "add-split-payment",
      "cart",
      delta(
        "## ADDED Requirements",
        "### Requirement: Split payment",
        "A shopper SHALL split a basket across two cards.",
      ),
    );

    const ids = ["reprice-cart-totals", "add-split-payment"];
    const result = upcomingFor(store, "cart", baseline, historyFor(ids, "cart"));

    assert.equal(result.requirements.length, 3);
    assert.deepEqual(result.driftedChanges, []);
    const split = result.requirements.find((r) => r.heading === "Split payment");
    assert.equal(split.touches[0].changeId, "add-split-payment");
  });

  it("names a change whose MODIFIED block could not fold", () => {
    writeBaseline("cart", baseline);
    // One character off "Cart totals" — the fold has nothing to match it to.
    writeDelta(
      "reprice-cart-total",
      "cart",
      delta("## MODIFIED Requirements", "### Requirement: Cart total", "rewritten"),
    );

    const ids = ["reprice-cart-total"];
    const result = upcomingFor(store, "cart", baseline, historyFor(ids, "cart"));

    assert.equal(result.driftedChanges.length, 1);
    assert.equal(result.driftedChanges[0].changeId, "reprice-cart-total");
    assert.equal(result.driftedChanges[0].drift.reason, "drift");
  });
});

/**
 * The chip row's own fold: given the same `upcoming.requirements` the server sent once,
 * re-derive the reading for whichever subset of changes is currently enabled, so toggling a
 * chip never has to ask the server again.
 */
describe("resolveUpcoming", () => {
  const requirements = [
    {
      heading: "Cart totals",
      baselineText: "### Requirement: Cart totals\nThe cart SHALL price a basket once.",
      touches: [
        { changeId: "reprice-cart-totals", operation: "MODIFIED", text: "reprice" },
        { changeId: "round-cart-totals", operation: "MODIFIED", text: "round" },
      ],
    },
    {
      heading: "Guest checkout",
      baselineText: "### Requirement: Guest checkout\nA shopper SHALL check out without an account.",
      touches: [],
    },
    {
      heading: "Split payment",
      baselineText: null,
      touches: [{ changeId: "add-split-payment", operation: "ADDED", text: "split" }],
    },
  ];

  it("marks a disagreement when two enabled changes both touch a requirement", () => {
    const readings = resolveUpcoming(requirements, [
      "reprice-cart-totals",
      "round-cart-totals",
      "add-split-payment",
    ]);

    const totals = readings.find((r) => r.heading === "Cart totals");
    assert.equal(totals.kind, "disagreement");
    assert.equal(totals.touches.length, 2);

    const guest = readings.find((r) => r.heading === "Guest checkout");
    assert.equal(guest.kind, "durable");

    const split = readings.find((r) => r.heading === "Split payment");
    assert.equal(split.kind, "single");
    assert.equal(split.changeId, "add-split-payment");
  });

  it("turns a disagreement back into a single fold when one side is disabled", () => {
    const readings = resolveUpcoming(requirements, ["reprice-cart-totals"]);

    const totals = readings.find((r) => r.heading === "Cart totals");
    assert.equal(totals.kind, "single");
    assert.equal(totals.changeId, "reprice-cart-totals");

    // Split payment only exists because of the change just disabled.
    assert.equal(
      readings.some((r) => r.heading === "Split payment"),
      false,
    );
  });

  it("reads as the durable baseline with every chip disabled", () => {
    const readings = resolveUpcoming(requirements, []);

    assert.deepEqual(
      readings.map((r) => [r.heading, r.kind]),
      [
        ["Cart totals", "durable"],
        ["Guest checkout", "durable"],
      ],
    );
  });
});

describe("changesTouching", () => {
  it("lists every change a requirement set mentions, once each, in first appearance order", () => {
    const requirements = [
      { heading: "A", baselineText: null, touches: [{ changeId: "x" }, { changeId: "y" }] },
      { heading: "B", baselineText: null, touches: [{ changeId: "y" }, { changeId: "z" }] },
    ];
    assert.deepEqual(changesTouching(requirements), ["x", "y", "z"]);
  });

  it("is empty for a capability nothing in development touches", () => {
    assert.deepEqual(changesTouching([]), []);
  });
});
