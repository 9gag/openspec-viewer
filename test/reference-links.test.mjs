/**
 * A citation is only worth linking if it goes to the right copy of the scenario.
 *
 * The same id is written down in the change that introduced it, in the baseline it folded
 * into, and in every change rewriting it. A link that lands on the archived copy shows the
 * reader a scenario that has since been rewritten, with nothing on the page saying so —
 * which is worse than the bare id they had before, because that one at least made them go
 * and look.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { checkReferences } from "../server/references.mjs";

let store;

function file(path, ...lines) {
  const abs = join(store, path);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, `${lines.join("\n")}\n`);
}

const citing = (id) => ({
  path: "openspec/changes/guest-checkout/tasks.md",
  text: `- [x] 1.1 Make \`${id}\` pass\n`,
});

const scenario = (title, ...steps) => [
  "## Requirements",
  "",
  "### Requirement: Cart totals",
  "",
  `#### Scenario: cart-SC-01 - ${title}`,
  ...steps,
];

beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-links-"));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe("resolved", () => {
  it("carries the scenario itself, so a reference can be read where it is cited", () => {
    file(
      "openspec/specs/storefront/cart/spec.md",
      ...scenario(
        "A basket is priced once",
        "- **WHEN** a shopper adds the same item twice",
        "- **THEN** the basket prices it once",
      ),
    );

    const { resolved } = checkReferences(store, [citing("cart-SC-01")]);
    assert.deepEqual(resolved["cart-sc-01"], {
      id: "cart-SC-01",
      title: "A basket is priced once",
      steps: [
        "- **WHEN** a shopper adds the same item twice",
        "- **THEN** the basket prices it once",
      ],
      path: "openspec/specs/storefront/cart/spec.md",
      line: 5,
      scope: "baseline",
      capability: "storefront/cart",
      change: null,
      artifact: "spec",
    });
  });

  it("stops the preview at the next heading", () => {
    file(
      "openspec/specs/storefront/cart/spec.md",
      ...scenario("A basket is priced once", "- **THEN** it is priced once"),
      "",
      "#### Scenario: cart-SC-02 - Something else",
      "- **THEN** not this",
    );

    assert.deepEqual(
      checkReferences(store, [citing("cart-SC-01")]).resolved["cart-sc-01"]
        .steps,
      ["- **THEN** it is priced once"],
    );
  });

  it("opens the baseline when a change also carries the scenario", () => {
    // The baseline is what the store is held to today. The delta rewriting it is a
    // proposal, and the archive is where it used to say something else.
    file(
      "openspec/specs/storefront/cart/spec.md",
      ...scenario("Shipped wording"),
    );
    file(
      "openspec/changes/rewrite-cart/specs/storefront/cart/spec.md",
      "## MODIFIED Requirements",
      "### Requirement: Cart totals",
      "#### Scenario: cart-SC-01 - Proposed wording",
    );
    file(
      "openspec/changes/archive/2026-01-09-cart/specs/storefront/cart/spec.md",
      ...scenario("Original wording"),
    );

    const at = checkReferences(store, [citing("cart-SC-01")]).resolved[
      "cart-sc-01"
    ];
    assert.equal(at.scope, "baseline");
    assert.equal(at.title, "Shipped wording");
  });

  it("opens the change when a scenario has not shipped yet", () => {
    file(
      "openspec/changes/add-cart/specs/storefront/cart/spec.md",
      ...scenario("Arriving with this change"),
    );

    const at = checkReferences(store, [citing("cart-SC-01")]).resolved[
      "cart-sc-01"
    ];
    assert.equal(at.scope, "development");
    assert.equal(at.change, "add-cart");
  });

  it("resolves only what the page actually cites", () => {
    // The store defines fourteen hundred ids in a real repository. What travels to the
    // browser is the handful about to be rendered.
    file(
      "openspec/specs/storefront/cart/spec.md",
      ...scenario("A basket is priced once"),
      "#### Scenario: cart-SC-02 - Not cited by anything",
    );

    assert.deepEqual(
      Object.keys(checkReferences(store, [citing("cart-SC-01")]).resolved),
      ["cart-sc-01"],
    );
  });
});
