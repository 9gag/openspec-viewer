/**
 * The join table the store writes in prose.
 *
 * Every scenario and every user story gets a permanent id, and then a journey's Accepted
 * by, a task, a test case and a review comment all name one as a bare string. Nothing
 * checks either end of it: a citation that resolves to nothing reads exactly like one that
 * resolves, and an id issued twice does not collide — it quietly gives two scenarios one
 * name, so everything pointing at it reaches whichever a reader finds first.
 *
 * The scope is the one thing here that had to be measured rather than reasoned about.
 * Narrower ones — the delta's own directory, or the change — were tried against a real
 * store and each reported citations as broken that were simply defined somewhere else.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  checkReferences,
  citations,
  definitions,
  storeIds,
} from "../server/references.mjs";

let store;

function file(path, ...lines) {
  const abs = join(store, path);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, `${lines.join("\n")}\n`);
}

const doc = (path, ...lines) => {
  file(path, ...lines);
  return { path, text: `${lines.join("\n")}\n` };
};

beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-refs-"));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe("definitions", () => {
  it("reads a scenario's heading and a story's, with the line each is on", () => {
    assert.deepEqual(
      definitions(
        [
          "# Cart",
          "#### Scenario: cart-SC-01 - A basket is priced once",
          "### cart-US-01: Shopper prices a basket",
        ].join("\n"),
      ),
      [
        { id: "cart-SC-01", line: 2 },
        { id: "cart-US-01", line: 3 },
      ],
    );
  });

  it("reads the letter a store is forced into when it cannot renumber", () => {
    // Ids are permanent, so a scenario belonging between 07 and 08 is issued as 07a.
    // Reading the digits alone made those scenarios invisible to both ends of the join.
    assert.deepEqual(
      definitions("#### Scenario: cart-SC-07a - Inserted later").map(
        (d) => d.id,
      ),
      ["cart-SC-07a"],
    );
  });
});

describe("citations", () => {
  it("reads ids written the way the store writes references", () => {
    assert.deepEqual(
      citations("- `cart-SC-01` — A basket is priced once").map((c) => c.id),
      ["cart-SC-01"],
    );
  });

  it("ignores an id spelled out in prose, including a heading's own", () => {
    // Without this a spec cites every scenario it defines, and the check answers a
    // question nobody asked.
    assert.deepEqual(citations("#### Scenario: cart-SC-01 - A basket"), []);
    assert.deepEqual(citations("cart-SC-01 covers this"), []);
  });
});

describe("storeIds", () => {
  it("indexes every definition under the store's openspec directory", () => {
    file("openspec/specs/cart/spec.md", "#### Scenario: cart-SC-01 - A");
    file(
      "openspec/changes/archive/2026-01-09-x/specs/cart/spec.md",
      "#### Scenario: cart-SC-02 - B",
    );

    const ids = storeIds(store);
    assert.deepEqual([...ids.keys()].sort(), ["cart-sc-01", "cart-sc-02"]);
  });
});

describe("checkReferences", () => {
  it("resolves a citation against anything in the store, not against its own file", () => {
    // A task names a scenario in a capability its change does not touch, and a delta's
    // journeys name scenarios already in the baseline. Both are normal, and both are
    // reported as broken by any scope narrower than the store.
    file("openspec/specs/cart/spec.md", "#### Scenario: cart-SC-01 - A basket");
    const tasks = doc(
      "openspec/changes/guest-checkout/tasks.md",
      "- [x] 1.1 Make `cart-SC-01` pass",
    );

    assert.deepEqual(checkReferences(store, [tasks]).unresolved, []);
  });

  it("names a citation nothing defines, and what it probably meant", () => {
    // A capability's prefix is long and chosen once, so the id written from memory is its
    // tail. "No such scenario" beside a store that plainly has one is not an answer.
    file(
      "openspec/specs/storefront/cart/spec.md",
      "#### Scenario: storefront-cart-SC-01 - A basket",
    );
    const tasks = doc(
      "openspec/changes/guest-checkout/tasks.md",
      "- [x] 1.1 Make `cart-SC-01` pass",
    );

    assert.deepEqual(checkReferences(store, [tasks]).unresolved, [
      {
        path: "openspec/changes/guest-checkout/tasks.md",
        id: "cart-SC-01",
        line: 1,
        meant: "storefront-cart-SC-01",
      },
    ]);
  });

  it("suggests nothing when two capabilities could both be meant", () => {
    file("openspec/specs/a/spec.md", "#### Scenario: a-cart-SC-01 - A");
    file("openspec/specs/b/spec.md", "#### Scenario: b-cart-SC-01 - B");
    const tasks = doc("openspec/changes/x/tasks.md", "see `cart-SC-01`");

    assert.equal(checkReferences(store, [tasks]).unresolved[0].meant, null);
  });

  it("reports an id issued twice in one document", () => {
    const spec = doc(
      "openspec/specs/cart/spec.md",
      "#### Scenario: cart-SC-01 - A basket",
      "#### Scenario: cart-SC-01 - Something else",
    );

    assert.deepEqual(checkReferences(store, [spec]).duplicates, [
      {
        path: "openspec/specs/cart/spec.md",
        id: "cart-SC-01",
        lines: [1, 2],
      },
    ]);
  });

  it("does not call one scenario written down twice a duplicate", () => {
    // A scenario appears in the change that introduced it, in the baseline it folded
    // into, and in every change rewriting it. That is one scenario in three files, which
    // is how the store works — so duplicates are only ever counted within one document.
    const spec = doc(
      "openspec/specs/cart/spec.md",
      "#### Scenario: cart-SC-01 - A basket",
    );
    const delta = doc(
      "openspec/changes/guest-checkout/specs/cart/spec.md",
      "#### Scenario: cart-SC-01 - A basket",
    );

    assert.deepEqual(checkReferences(store, [spec, delta]).duplicates, []);
  });
});
