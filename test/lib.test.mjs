/**
 * The published library entries, tested the way a consumer meets them.
 *
 * Everything else in this suite imports the implementation by relative path, which is
 * the right thing when the subject is an inference. Here the subject is the packaging:
 * that `@seankcw/openspec-viewer/lib/store` and `/lib/spec` resolve at all, that they
 * export what `lib/*.d.mts` promises, and that a publish ships the files they lean on.
 * Node resolves a package's own name from inside it once `exports` is declared, so
 * these imports fail exactly when a consumer's would.
 *
 * The inferences themselves are covered by staleness, conflicts, catalog-state, bdd and
 * spec. What is checked here is the shape of every return value, because the type
 * declarations are hand-written and nothing else would notice them going stale.
 */

import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import * as spec from "@seankcw/openspec-viewer/lib/spec";
import * as store from "@seankcw/openspec-viewer/lib/store";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

const SPEC_TEXT = [
  "## Purpose",
  "",
  "The cart holds what a shopper means to buy.",
  "",
  "### Requirement: Cart holds line items",
  "",
  "The cart SHALL hold one line item per distinct product.",
  "",
  "#### Scenario: cart-SC-01 - Adding a new product",
  "",
  "- **WHEN** a shopper adds a product that is not in the cart",
  "- **THEN** the cart contains one line for that product",
  "",
].join("\n");

const TASKS = [
  "## 1. Wire the endpoint (owner: @dana)",
  "",
  "- [x] 1.1 Return the rows",
  "- [ ] 1.2 Page them",
  "  and say how many are left",
  "",
].join("\n");

describe("lib/spec", () => {
  it("parses a spec into prose and requirements carrying their scenarios", () => {
    const nodes = spec.parseSpec(SPEC_TEXT);

    const requirement = nodes.find((node) => node.kind === "requirement");
    assert.equal(requirement.title, "Cart holds line items");
    assert.equal(requirement.scenarios.length, 1);
    assert.deepEqual(
      { ...requirement.scenarios[0], text: undefined },
      { id: "cart-SC-01", title: "Adding a new product", text: undefined },
    );
    assert.ok(nodes.some((node) => node.kind === "prose"));
  });

  it("reads a scenario heading, with and without an id", () => {
    assert.deepEqual(spec.scenarioName("cart-SC-01 - Adding a new product"), {
      id: "cart-SC-01",
      title: "Adding a new product",
    });
    assert.deepEqual(spec.scenarioName("Adding a new product"), {
      id: null,
      title: "Adding a new product",
    });
  });

  it("indexes scenarios by the id a reference would name", () => {
    const index = spec.scenarioIndex(spec.parseSpec(SPEC_TEXT), "cart");
    const found = index.get("cart-sc-01");

    assert.equal(found.requirement, "Cart holds line items");
    assert.equal(found.anchor, "cart-sc-01");
    assert.equal(index.size, 1);
  });

  it("anchors a scenario on its id, and on its title when it has none", () => {
    assert.equal(
      spec.scenarioAnchor({ id: "cart-SC-01", title: "Anything" }, "cart"),
      "cart-sc-01",
    );
    assert.equal(
      spec.scenarioAnchor({ id: null, title: "Adding a new product" }, "cart"),
      "cart-adding-a-new-product",
    );
  });

  it("publishes the scenario id shape as a regex source, not a regex", () => {
    assert.equal(typeof spec.SCENARIO_ID, "string");
    assert.match("cart-SC-01", new RegExp(`^${spec.SCENARIO_ID}$`));
  });

  it("splits a spec into steps, references and markdown, losing no content", () => {
    const blocks = spec.splitSpec(SPEC_TEXT);
    const steps = blocks.find((block) => block.type === "steps");

    assert.deepEqual(steps.steps[0], {
      keyword: "WHEN",
      kind: "trigger",
      text: "a shopper adds a product that is not in the cart",
    });
    assert.equal(steps.steps[1].kind, "outcome");

    // Every line back out, blank lines and indentation aside — the same invariant
    // `bdd.test.mjs` holds the splitter to, restated here because it is the one
    // promise this entry makes to a renderer that is not ours.
    const written = (text) =>
      text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .join("\n");
    const back = blocks.flatMap((block) =>
      block.type === "markdown"
        ? block.text.split("\n")
        : block.type === "steps"
          ? block.steps.map((step) => `- **${step.keyword}** ${step.text}`)
          : block.refs.map((ref) => `- \`${ref.id}\` - ${ref.title}`),
    );
    assert.equal(written(back.join("\n")), written(SPEC_TEXT));
  });

  it("reads a run of scenario references", () => {
    const blocks = spec.splitSpec("- `cart-SC-01` - Adding a new product\n");
    assert.deepEqual(blocks[0], {
      type: "refs",
      refs: [{ id: "cart-SC-01", title: "Adding a new product" }],
    });
  });

  it("marks obligations and leaves ordinary prose in one part", () => {
    assert.deepEqual(spec.emphasize("The cart SHALL hold it."), [
      { text: "The cart ", kind: null },
      { text: "SHALL", kind: "obligation" },
      { text: " hold it.", kind: null },
    ]);
    assert.deepEqual(spec.emphasize("Nothing normative here."), [
      { text: "Nothing normative here.", kind: null },
    ]);
  });

  it("names a step keyword's role, case-insensitively", () => {
    assert.equal(spec.stepKind("when"), "trigger");
    assert.equal(spec.stepKind("THEN"), "outcome");
    assert.equal(spec.stepKind("AND"), "conjunction");
    assert.equal(spec.stepKind("cart"), null);
    assert.ok(spec.STEP_KEYWORDS.includes("WHEN"));
  });
});

describe("lib/store", () => {
  let path;

  /** One change's delta on one capability. */
  const delta = (changeId, capability, heading) => {
    const dir = join(
      path,
      "openspec",
      "changes",
      changeId,
      "specs",
      capability,
    );
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "spec.md"), `${heading}\n\n### Requirement: A\n`);
  };

  beforeEach(() => {
    path = mkdtempSync(join(tmpdir(), "openspec-viewer-lib-"));
  });
  afterEach(() => rmSync(path, { recursive: true, force: true }));

  it("parses task groups, owners and wrapped tasks", () => {
    const [group] = store.parseTasks(TASKS);

    assert.equal(group.num, "1");
    assert.equal(group.title, "Wire the endpoint");
    assert.equal(group.owner, "dana");
    assert.deepEqual(group.tasks[0], {
      done: true,
      id: "1.1",
      text: "Return the rows",
    });
    assert.equal(group.tasks[1].text, "Page them and say how many are left");
  });

  it("dates a claim from the newest checkmark, and says which", () => {
    const now = Date.UTC(2026, 0, 20);
    const day = 86_400_000;
    const groups = (owner, done) =>
      new Map([
        [
          "1",
          {
            num: "1",
            title: "Wire the endpoint",
            owner,
            tasks: [
              { done: done > 0, id: "1.1", text: "a" },
              { done: false, id: "1.2", text: "b" },
            ],
          },
        ],
      ]);

    const snaps = [
      { sha: "b", at: now - 4 * day, groups: groups("dana", 1) },
      { sha: "a", at: now - 9 * day, groups: groups("dana", 0) },
    ];
    const group = snaps[0].groups.get("1");

    assert.deepEqual(store.idleness(group, snaps, now), {
      since: now - 4 * day,
      days: 4,
      source: "progress",
    });
  });

  it("refuses to date a claim the history cannot account for", () => {
    const group = {
      num: "1",
      title: "Wire the endpoint",
      owner: "dana",
      tasks: [{ done: false, id: "1.1", text: "a" }],
    };
    assert.equal(store.idleness(group, [], Date.now()), null);
    assert.equal(
      store.idleness({ ...group, owner: null }, [], Date.now()),
      null,
    );
  });

  it("reads no history out of a directory that is not a git checkout", () => {
    assert.deepEqual(store.snapshots(path, "guest-checkout"), []);
  });

  it("lists changes in development and leaves the archive out", () => {
    delta("guest-checkout", "checkout/cart", "## ADDED Requirements");
    mkdirSync(join(path, "openspec", "changes", "archive", "old-one"), {
      recursive: true,
    });

    assert.deepEqual(store.changeIds(path), ["guest-checkout"]);
  });

  it("keys in-development deltas by capability, with their kinds", () => {
    delta("guest-checkout", "checkout/cart", "## MODIFIED Requirements");
    delta("stock-alerts", "shared/ui", "## Purpose");

    const byCapability = store.deltasInDevelopment(path);
    const [entry] = byCapability.get("checkout/cart");

    assert.deepEqual(entry.kinds, ["MODIFIED"]);
    assert.equal(entry.change, "guest-checkout");
    assert.equal(entry.archived, false);
    assert.deepEqual(byCapability.get("shared/ui")[0].kinds, ["NEW"]);
  });

  it("names the capability two changes in development both delta", () => {
    delta("guest-checkout", "checkout/cart", "## MODIFIED Requirements");
    delta("stock-alerts", "checkout/cart", "## ADDED Requirements");
    delta("stock-alerts", "shared/ui", "## ADDED Requirements");

    const found = store.conflicts(path, store.changeIds(path));

    assert.equal(found.length, 1);
    assert.equal(found[0].capability, "checkout/cart");
    assert.deepEqual(found[0].modifies, ["guest-checkout"]);
    assert.deepEqual(found[0].changes.map((one) => one.change).sort(), [
      "guest-checkout",
      "stock-alerts",
    ]);
  });

  it("tells a withdrawn capability from one still arriving", () => {
    const history = (kinds) => [
      {
        change: "guest-checkout",
        changeId: "guest-checkout",
        kinds,
        archived: true,
        at: 1,
        archivedOn: "2026-01-01",
      },
    ];

    assert.equal(
      store.capabilityState({ shipped: true, history: [] }),
      "shipped",
    );
    assert.equal(
      store.capabilityState({ shipped: false, history: history(["REMOVED"]) }),
      "retired",
    );
    assert.equal(
      store.capabilityState({ shipped: false, history: history(["ADDED"]) }),
      "unshipped",
    );
  });
});

/**
 * The half of the contract that only breaks after a publish.
 *
 * A façade re-exporting a file the tarball leaves behind resolves in this repo and
 * nowhere else, and the entries are how another tool reaches the inferences — so the
 * failure would land on a consumer as a module that cannot be found, with nothing here
 * having gone red.
 */
describe("the published entries", () => {
  const shipped = (path) =>
    manifest.files.some(
      (entry) => entry === path || path.startsWith(`${entry}/`),
    );

  it("declares an entry for each façade, pointing at files that exist", () => {
    const entries = Object.entries(manifest.exports).filter(([name]) =>
      name.startsWith("./lib/"),
    );
    assert.equal(entries.length, 2);

    for (const [, condition] of entries) {
      for (const target of Object.values(condition)) {
        assert.ok(
          existsSync(join(ROOT, target)),
          `${target} is named in exports but not on disk`,
        );
      }
    }
  });

  it("ships every file the façades re-export from", () => {
    for (const entry of ["lib/store.mjs", "lib/spec.mjs"]) {
      assert.ok(shipped(entry), `${entry} is not in package.json files`);

      const text = readFileSync(join(ROOT, entry), "utf8");
      const sources = [...text.matchAll(/from\s+"(\.\.\/[^"]+)"/g)].map(
        (match) => match[1].replace("../", ""),
      );
      assert.ok(sources.length > 0, `${entry} re-exports nothing`);

      for (const source of sources) {
        assert.ok(
          existsSync(join(ROOT, source)),
          `${entry} re-exports ${source}, which is not on disk`,
        );
        assert.ok(
          shipped(source),
          `${entry} re-exports ${source}, which package.json files leaves behind`,
        );
      }
    }
  });
});
