/**
 * The nav answers "what is in the store"; this answers "where does it say that". The
 * failure that matters is not a missed line — it is a hit filed under the wrong thing: a
 * delta on a change in development shown as the shipped baseline sends a reader to edit a
 * document that is already frozen, or to trust one that is still being argued over.
 *
 * So most of these are about the classification, which is pure path reading, and the rest
 * pin the two decisions the matching makes: the archive is not read unless asked for, and
 * an id is a lookup that shows every place it lives at once.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { classify, searchStore } from "../server/search.mjs";

let store;

/** A markdown file at a store-relative path. */
function file(path, ...lines) {
  const abs = join(store, path);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, `${lines.join("\n")}\n`);
}

/**
 * The store path is passed in rather than resolved, which is the split every reader in
 * server/ already keeps: the function that reads takes a path, and the one the route calls
 * resolves it. It is also what lets these run without spawning the CLI.
 */
const search = (query, options) => searchStore(store, query, options);

beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-search-"));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe("classify", () => {
  it("reads a shipped spec as the baseline for its capability", () => {
    assert.deepEqual(classify("openspec/specs/storefront/checkout/spec.md"), {
      scope: "baseline",
      capability: "storefront/checkout",
      change: null,
      artifact: "spec",
    });
  });

  it("keeps a document filed beside a spec under the same capability", () => {
    assert.deepEqual(classify("openspec/specs/shared/ui/cart/test-cases.md"), {
      scope: "baseline",
      capability: "shared/ui/cart",
      change: null,
      artifact: "test-cases",
    });
  });

  it("reads a change's own artifact as the change, with no capability", () => {
    assert.deepEqual(classify("openspec/changes/guest-checkout/proposal.md"), {
      scope: "development",
      capability: null,
      change: "guest-checkout",
      artifact: "proposal",
    });
  });

  it("reads a delta as both: the capability it rewrites, on the change rewriting it", () => {
    assert.deepEqual(
      classify(
        "openspec/changes/guest-checkout/specs/storefront/checkout/spec.md",
      ),
      {
        scope: "development",
        capability: "storefront/checkout",
        change: "guest-checkout",
        artifact: "spec",
      },
    );
  });

  it("tells a shipped change from one in development", () => {
    // The whole point of the scope: these two paths differ by one segment, and a reader
    // sent to the archived one is reading a document nobody will change again.
    const shipped = classify(
      "openspec/changes/archive/2026-01-09-guest-checkout/specs/storefront/checkout/spec.md",
    );
    assert.equal(shipped.scope, "archive");
    assert.equal(shipped.change, "2026-01-09-guest-checkout");
    assert.equal(shipped.capability, "storefront/checkout");
  });
});

describe("search", () => {
  it("finds the line, and says which document and where in it", () => {
    file(
      "openspec/specs/storefront/checkout/spec.md",
      "## Purpose",
      "Taking payment for a basket.",
      "### Requirement: Guest checkout",
    );

    const found = search("guest checkout");
    assert.equal(found.matched, 1);
    assert.deepEqual(found.results[0].hits, [
      { line: 3, text: "### Requirement: Guest checkout", heading: true },
    ]);
  });

  it("leaves the archive out until it is asked for", () => {
    // Most of a store's text is the archive and all of it is frozen. Read by default it
    // buries the plan somebody is working on under the record of what already shipped.
    file(
      "openspec/specs/storefront/checkout/spec.md",
      "A basket is priced once.",
    );
    file(
      "openspec/changes/archive/2026-01-09-guest-checkout/proposal.md",
      "A basket is priced once.",
    );

    const plan = search("priced once");
    assert.deepEqual(
      plan.results.map((r) => r.scope),
      ["baseline"],
    );

    const record = search("priced once", { archive: true });
    assert.deepEqual(
      record.results.map((r) => r.scope),
      ["baseline", "archive"],
    );
  });

  it("shows an id where it is defined and everywhere it is cited", () => {
    // The store issues permanent ids, and a task, a review comment and a journey all name
    // one as a bare string. This is the question those readers actually have.
    file(
      "openspec/specs/storefront/checkout/spec.md",
      "#### Scenario: checkout-SC-07 - Card is declined",
    );
    file(
      "openspec/specs/storefront/checkout/user-journeys.md",
      "- `checkout-SC-07` — Card is declined",
    );

    const found = search("checkout-SC-07");
    assert.equal(found.id, true);
    assert.deepEqual(
      found.results.map((r) => [r.artifact, r.defines]),
      [
        ["spec", true],
        ["user-journeys", false],
      ],
    );
  });

  it("matches without regard to case, and takes the query literally", () => {
    // A reader retypes a phrase out of a spec, and `specs/**` is a query that either
    // throws as a regex or quietly means something else.
    file(
      "openspec/specs/storefront/checkout/spec.md",
      "Generates specs/**/spec.md",
    );

    assert.equal(search("SPECS/**").matched, 1);
    assert.equal(search("specs/*.md").matched, 0);
  });

  it("answers nothing for a query too short to be one", () => {
    file(
      "openspec/specs/storefront/checkout/spec.md",
      "A basket is priced once.",
    );

    const found = search("a");
    assert.equal(found.scanned, 0);
    assert.deepEqual(found.results, []);
  });

  it("counts every hit in a document but sends only the first few", () => {
    file(
      "openspec/specs/storefront/checkout/spec.md",
      ...Array.from({ length: 9 }, (_, i) => `Line ${i} mentions the basket.`),
    );

    const [only] = search("basket").results;
    assert.equal(only.total, 9);
    assert.equal(only.hits.length, 5);
  });
});
