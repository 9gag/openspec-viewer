/**
 * Light / dark / follow-the-OS is handed straight to Astryx's `<Theme mode>`, whose
 * `ThemeMode` union is the real contract: `Theme` acts on 'light' and 'dark' and treats
 * anything else as "follow the system", so a typo here degrades silently to Auto rather
 * than failing. These read the union from the package Astryx ships.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import { DEFAULT_MODE, MODES } from "../src/mode.js";

const SRC = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

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

describe("appearance modes", () => {
  it("offers only modes Astryx recognises", () => {
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
