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
import {
  buildUpcomingDocText,
  buildUpcomingText,
  changesTouching,
} from "../src/upcoming.js";

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

  function writeChangeDoc(changeId, capability, file, text) {
    const dir = join(store, "openspec", "changes", changeId, "specs", capability);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, file), text);
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
    // Neither change carries a document of its own beside spec.md.
    assert.deepEqual(result.docs, []);
  });

  it("gathers each change's own copy of a document filed beside spec.md", () => {
    writeBaseline("cart", baseline);
    writeDelta("reprice-cart-totals", "cart", delta("## MODIFIED Requirements"));
    writeChangeDoc(
      "reprice-cart-totals",
      "cart",
      "user-journeys.md",
      "A shopper reprices their basket.",
    );
    writeDelta("add-split-payment", "cart", delta("## ADDED Requirements"));
    writeChangeDoc(
      "add-split-payment",
      "cart",
      "user-journeys.md",
      "A shopper splits their basket across two cards.",
    );

    const ids = ["reprice-cart-totals", "add-split-payment"];
    const result = upcomingFor(store, "cart", baseline, historyFor(ids, "cart"));

    assert.equal(result.docs.length, 1);
    assert.equal(result.docs[0].name, "user-journeys");
    assert.equal(result.docs[0].label, "User Journeys");
    assert.deepEqual(
      result.docs[0].versions.map((d) => d.changeId).sort(),
      ["add-split-payment", "reprice-cart-totals"],
    );
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
 * splice the enabled subset onto the baseline's own document — same headings, same order,
 * same Purpose section — so toggling a chip never has to ask the server again, and Upcoming
 * never reorients a reader the way a separate list of touched requirements would.
 */
describe("buildUpcomingText", () => {
  const fullBaseline = [
    "# cart Specification",
    "",
    "## Purpose",
    "",
    "Taking payment for a basket.",
    "",
    "## Requirements",
    "",
    "### Requirement: Cart totals",
    "",
    "The cart SHALL price a basket once.",
    "",
    "### Requirement: Guest checkout",
    "",
    "A shopper SHALL check out without an account.",
    "",
  ].join("\n");

  const requirements = [
    {
      heading: "Cart totals",
      baselineText: "### Requirement: Cart totals\n\nThe cart SHALL price a basket once.",
      touches: [
        {
          changeId: "reprice-cart-totals",
          operation: "MODIFIED",
          text: "### Requirement: Cart totals\nThe cart SHALL price a basket once, including tax.",
        },
        {
          changeId: "round-cart-totals",
          operation: "MODIFIED",
          text: "### Requirement: Cart totals\nThe cart SHALL price a basket once, rounded to the nearest cent.",
        },
      ],
    },
    {
      heading: "Guest checkout",
      baselineText:
        "### Requirement: Guest checkout\n\nA shopper SHALL check out without an account.",
      touches: [],
    },
    {
      heading: "Split payment",
      baselineText: null,
      touches: [
        {
          changeId: "add-split-payment",
          operation: "ADDED",
          text: "### Requirement: Split payment\nA shopper SHALL split a basket across two cards.",
        },
      ],
    },
  ];

  it("reads exactly like the baseline with every chip disabled", () => {
    const text = buildUpcomingText(fullBaseline, requirements, []);

    assert.equal(text.includes("## Purpose"), true);
    assert.equal(text.includes("The cart SHALL price a basket once."), true);
    assert.equal(text.includes("including tax"), false);
    // Split payment only exists because of a change that is disabled.
    assert.equal(text.includes("Split payment"), false);
  });

  it("splices a single enabled touch in place, marked with its change", () => {
    const text = buildUpcomingText(fullBaseline, requirements, ["reprice-cart-totals"]);

    assert.equal(text.includes("**MODIFIED** · via `reprice-cart-totals`"), true);
    assert.equal(text.includes("including tax"), true);
    assert.equal(text.includes("rounded to the nearest cent"), false);
    // Untouched requirements still appear, in the baseline's own order.
    assert.ok(text.indexOf("Cart totals") < text.indexOf("Guest checkout"));
    assert.equal(text.includes("without an account"), true);
  });

  it("shows both versions when two enabled changes touch the same requirement", () => {
    const text = buildUpcomingText(fullBaseline, requirements, [
      "reprice-cart-totals",
      "round-cart-totals",
    ]);

    assert.equal(text.includes("2 changes disagree here"), true);
    assert.equal(text.includes("including tax"), true);
    assert.equal(text.includes("rounded to the nearest cent"), true);
  });

  it("appends an ADDED requirement after the baseline's own requirements", () => {
    const text = buildUpcomingText(fullBaseline, requirements, ["add-split-payment"]);

    assert.equal(text.includes("**ADDED** · via `add-split-payment`"), true);
    assert.ok(text.indexOf("Guest checkout") < text.indexOf("Split payment"));
  });

  it("keeps a removed requirement visible, marked and reasoned", () => {
    const removed = [
      {
        heading: "Cart totals",
        baselineText: requirements[0].baselineText,
        touches: [
          {
            changeId: "drop-cart-totals",
            operation: "REMOVED",
            text: "### Requirement: Cart totals\n**Reason**: Pricing moves elsewhere.",
          },
        ],
      },
    ];

    const text = buildUpcomingText(fullBaseline, removed, ["drop-cart-totals"]);

    assert.equal(text.includes("The cart SHALL price a basket once."), true);
    assert.equal(text.includes("**REMOVED** · via `drop-cart-totals`"), true);
    assert.equal(text.includes("Pricing moves elsewhere."), true);
  });

  it("builds from ADDED-only requirements when the capability has no baseline", () => {
    const unshipped = [requirements[2]];
    const text = buildUpcomingText(null, unshipped, ["add-split-payment"]);

    assert.equal(text.includes("Split payment"), true);
    assert.equal(text.includes("**ADDED** · via `add-split-payment`"), true);
  });

  it("is empty when an unshipped capability's only change is disabled", () => {
    const unshipped = [requirements[2]];
    assert.equal(buildUpcomingText(null, unshipped, []), "");
  });
});

describe("buildUpcomingDocText", () => {
  const durable = "A shopper checks out as a guest.";

  it("reads exactly like the shipped document with nothing enabled", () => {
    const versions = [{ changeId: "add-split-payment", text: "A shopper splits a basket." }];
    assert.equal(buildUpcomingDocText(durable, versions, []), durable);
  });

  it("shows the shipped text and the one enabled copy, marked", () => {
    const versions = [{ changeId: "add-split-payment", text: "A shopper splits a basket." }];
    const text = buildUpcomingDocText(durable, versions, ["add-split-payment"]);

    assert.equal(text.includes("**Shipped**"), true);
    assert.equal(text.includes(durable), true);
    assert.equal(text.includes("**Not yet shipped** · via `add-split-payment`"), true);
    assert.equal(text.includes("A shopper splits a basket."), true);
  });

  it("shows just the change's copy for a document with no shipped version", () => {
    const versions = [{ changeId: "add-split-payment", text: "A shopper splits a basket." }];
    const text = buildUpcomingDocText(null, versions, ["add-split-payment"]);

    assert.equal(text.includes("**Shipped**"), false);
    assert.equal(text.includes("A shopper splits a basket."), true);
  });

  it("shows every enabled copy and the shipped text when two changes disagree", () => {
    const versions = [
      { changeId: "add-split-payment", text: "A shopper splits a basket by card." },
      { changeId: "add-wallet-split", text: "A shopper splits a basket by wallet." },
    ];
    const text = buildUpcomingDocText(durable, versions, [
      "add-split-payment",
      "add-wallet-split",
    ]);

    assert.equal(text.includes("2 changes disagree here"), true);
    assert.equal(text.includes("by card"), true);
    assert.equal(text.includes("by wallet"), true);
    assert.equal(text.includes(durable), true);
  });
});

describe("changesTouching", () => {
  it("lists every change spec.md's requirements mention, once each, in first appearance order", () => {
    const upcoming = {
      requirements: [
        { heading: "A", baselineText: null, touches: [{ changeId: "x" }, { changeId: "y" }] },
        { heading: "B", baselineText: null, touches: [{ changeId: "y" }, { changeId: "z" }] },
      ],
    };
    assert.deepEqual(changesTouching(upcoming), ["x", "y", "z"]);
  });

  it("includes changes that only touch a document beside spec.md", () => {
    const upcoming = {
      requirements: [
        { heading: "A", baselineText: null, touches: [{ changeId: "x" }] },
      ],
      docs: [{ name: "user-journeys", versions: [{ changeId: "y" }] }],
    };
    assert.deepEqual(changesTouching(upcoming), ["x", "y"]);
  });

  it("is empty for a capability nothing in development touches", () => {
    assert.deepEqual(changesTouching({}), []);
  });
});
