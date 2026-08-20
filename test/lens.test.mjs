/**
 * The lens decides which board panels a role sees, so a lens naming a panel nobody
 * renders produces a silently empty board — which is exactly how the designer lens first
 * shipped, showing "nothing to chase" on a store with uncovered changes.
 *
 * Nothing here renders React. The coupling being tested is between two lists of strings,
 * and reading the view as text pins them together without a JSX loader in the test run.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_LENS, LENSES, PANELS, resolveTab } from "../src/lens.js";
import { DEFAULT_MODE, MODES } from "../src/mode.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");
const source = (rel) => readFileSync(join(SRC, rel), "utf8");

/** The ThemeMode union Astryx publishes, read from its shipped types. */
const themeModes = new Set(
  (
    readFileSync(
      join(
        SRC,
        "..",
        "node_modules",
        "@astryxdesign",
        "core",
        "dist",
        "theme",
        "types.d.ts",
      ),
      "utf8",
    ).match(/type ThemeMode = ([^;]+);/)?.[1] ?? ""
  )
    .split("|")
    .map((s) => s.trim().replace(/'/g, ""))
    .filter(Boolean),
);

// Both patterns accept either quote: the formatter decides which one the source
// carries, and a test that reads the view as text should not fail on a reformat.

/** Panel names Board.jsx actually branches on, from its panel() switch. */
const rendered = new Set(
  [...source("views/Board.jsx").matchAll(/name === (['"])([^'"]+)\1/g)].map(
    (m) => m[2],
  ),
);

describe("lens definitions", () => {
  it("declares the same panel names the board renders", () => {
    assert.deepEqual([...rendered].sort(), [...PANELS].sort());
  });

  it("only asks for panels that exist", () => {
    for (const [name, lens] of Object.entries(LENSES)) {
      for (const panel of lens.panels) {
        assert.ok(
          PANELS.includes(panel),
          `${name} lens asks for unknown panel '${panel}'`,
        );
      }
    }
  });

  it("names a default tab for every role", () => {
    // Not checked against a fixed list: the tabs on a change page are that change's own
    // files, and which files it has is the schema's call, not this module's.
    for (const [name, lens] of Object.entries(LENSES)) {
      assert.ok(lens.defaultTab, `${name} lens has no default tab`);
    }
  });

  it("gives every lens at least one panel, so no role lands on an empty board", () => {
    for (const [name, lens] of Object.entries(LENSES)) {
      assert.ok(lens.panels.length > 0, `${name} lens has no panels`);
      assert.ok(lens.blurb, `${name} lens has no blurb`);
    }
  });

  it("has a default lens that exists", () => {
    assert.ok(
      LENSES[DEFAULT_LENS],
      `default lens '${DEFAULT_LENS}' is not defined`,
    );
  });
});

describe("appearance modes", () => {
  it("offers only modes Astryx recognises", () => {
    // Theme acts on 'light' and 'dark' and treats anything else as "follow the system",
    // so a typo here degrades silently to Auto instead of failing.
    assert.ok(
      themeModes.size >= 3,
      "expected to read the ThemeMode union from Astryx",
    );
    for (const m of MODES) {
      assert.ok(
        themeModes.has(m.value),
        `mode '${m.value}' is not an Astryx ThemeMode`,
      );
    }
  });

  it("covers every mode Astryx supports, so nothing is unreachable from the UI", () => {
    assert.deepEqual(MODES.map((m) => m.value).sort(), [...themeModes].sort());
  });

  it("gives every mode a label, and defaults to one that exists", () => {
    for (const m of MODES) assert.ok(m.label, `mode '${m.value}' has no label`);
    assert.ok(
      MODES.some((m) => m.value === DEFAULT_MODE),
      `default mode '${DEFAULT_MODE}' is not offered`,
    );
  });
});

describe("resolveTab", () => {
  const artifacts = [
    { name: "proposal" },
    { name: "specs" },
    { name: "design" },
    { name: "tasks" },
  ];

  it("honours the lens when the change has that artifact", () => {
    assert.equal(resolveTab(artifacts, "tasks"), "tasks");
  });

  it("falls back to the first artifact rather than showing nothing", () => {
    // The designer lens opens on 'ui', which only some schemas declare. Landing on a
    // blank page is how a role stops opening changes at all.
    assert.equal(resolveTab(artifacts, "ui"), "proposal");
  });

  it("survives a change with no artifacts at all", () => {
    assert.equal(resolveTab([], "proposal"), null);
  });
});
