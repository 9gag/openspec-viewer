/**
 * The tabs on a change page are the change's own files, and which files a change is
 * supposed to have is the workflow schema's call — `spec-driven` writes four artifacts,
 * `full-planning` adds a ui.md, and a store can fork its own. Two changes in one store
 * can sit on different schemas.
 *
 * These pin that reading. Getting it wrong is quiet in a specific way: a file the viewer
 * does not know about is not rendered wrong, it is simply not on the page at all, and
 * nothing tells the person reading that half the change is missing.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import {
  changeArtifacts,
  label,
  schemaArtifacts,
} from "../server/artifacts.mjs";

let store;

/** A schema definition, written where a store keeps its own. */
function schema(name, artifacts) {
  const dir = join(store, "openspec", "schemas", name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "schema.yaml"),
    [
      `name: ${name}`,
      "version: 1",
      "artifacts:",
      ...artifacts.flatMap(([id, generates]) => [
        `  - id: ${id}`,
        `    generates: ${generates}`,
        `    description: The ${id}`,
        "    instruction: |",
        "      Write it.",
        // Prose under an artifact can say anything, including things shaped like keys.
        "      - id: not-an-artifact",
        "        generates: nothing.md",
      ]),
      "apply:",
      "  instruction: Build it.",
      "",
    ].join("\n"),
  );
}

/** One change directory: its schema marker, its files, and its spec deltas. */
function change(id, schemaName, files, capabilities = []) {
  const dir = join(store, "openspec", "changes", id);
  mkdirSync(dir, { recursive: true });
  if (schemaName) {
    writeFileSync(
      join(dir, ".openspec.yaml"),
      `schema: ${schemaName}\ncreated: 2026-08-20\n`,
    );
  }
  for (const name of files) writeFileSync(join(dir, name), `# ${name}\n`);
  for (const cap of capabilities) {
    mkdirSync(join(dir, "specs", cap), { recursive: true });
    const spec = join(dir, "specs", cap, "spec.md");
    writeFileSync(spec, "## ADDED Requirements\n");
  }
  return join("openspec", "changes", id);
}

beforeEach(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-artifacts-"));
});
afterEach(() => rmSync(store, { recursive: true, force: true }));

describe("schemaArtifacts", () => {
  it("reads the ids and outputs in the order the schema declares them", () => {
    schema("order-schema", [
      ["proposal", "proposal.md"],
      ["specs", '"specs/**/*.md"'],
      ["design", "design.md"],
      ["ui", "ui.md"],
      ["tasks", "tasks.md"],
    ]);

    assert.deepEqual(schemaArtifacts(store, "order-schema"), [
      { id: "proposal", generates: "proposal.md" },
      { id: "specs", generates: "specs/**/*.md" },
      { id: "design", generates: "design.md" },
      { id: "ui", generates: "ui.md" },
      { id: "tasks", generates: "tasks.md" },
    ]);
  });

  it("is empty for a change that names no schema", () => {
    // The important half is that it does not spawn the CLI to ask about a schema that
    // was never named — the board calls through here for every change on every poll.
    assert.deepEqual(schemaArtifacts(store, undefined), []);
  });
});

describe("changeArtifacts", () => {
  it("offers exactly what the schema declares, in its order", () => {
    schema("full-ish", [
      ["proposal", "proposal.md"],
      ["specs", "specs/**/*.md"],
      ["design", "design.md"],
      ["ui", "ui.md"],
      ["tasks", "tasks.md"],
    ]);
    const dir = change(
      "add-product-page",
      "full-ish",
      ["proposal.md", "design.md", "ui.md", "tasks.md"],
      ["store/product-page"],
    );

    const found = changeArtifacts(store, dir);
    assert.deepEqual(
      found.map((a) => a.name),
      ["proposal", "specs", "design", "ui", "tasks"],
    );
    assert.ok(found.every((a) => a.present));
    assert.deepEqual(
      found.map((a) => a.kind),
      ["doc", "specs", "doc", "doc", "tasks"],
    );
  });

  it("reports an artifact the schema wants that is not written yet", () => {
    schema("planning", [
      ["proposal", "proposal.md"],
      ["tasks", "tasks.md"],
    ]);
    const dir = change("half-written", "planning", ["proposal.md"]);

    assert.deepEqual(
      changeArtifacts(store, dir).map((a) => [a.name, a.present]),
      [
        ["proposal", true],
        ["tasks", false],
      ],
    );
  });

  it("still lists a file the schema never declared", () => {
    // A change that carries a README.md carries it for a reason. Showing only the
    // expected files is how half a change becomes invisible.
    schema("plain", [["proposal", "proposal.md"]]);
    const dir = change("has-a-readme", "plain", ["proposal.md", "README.md"]);

    assert.deepEqual(
      changeArtifacts(store, dir).map((a) => a.name),
      ["proposal", "README"],
    );
  });

  it("counts specs only when a capability delta is actually there", () => {
    schema("with-specs", [["specs", "specs/**/*.md"]]);
    const empty = change("no-deltas", "with-specs", []);
    const delta = change("has-deltas", "with-specs", [], ["cart"]);

    assert.equal(changeArtifacts(store, empty)[0].present, false);
    assert.equal(changeArtifacts(store, delta)[0].present, true);
  });

  it("falls back to a conventional order when no schema is named", () => {
    const dir = change("unmarked", null, ["tasks.md", "proposal.md"]);

    const present = changeArtifacts(store, dir)
      .filter((a) => a.present)
      .map((a) => a.name);
    // Alphabetical would open the change on its task list. The fallback decides only
    // the order; which tabs exist is still whatever is on disk.
    assert.deepEqual(present, ["proposal", "tasks"]);
  });
});

describe("label", () => {
  it("title-cases an id", () => {
    assert.equal(label("proposal"), "Proposal");
    assert.equal(label("design-notes"), "Design Notes");
  });

  it("leaves acronyms and shouted filenames alone", () => {
    assert.equal(label("ui"), "UI");
    assert.equal(label("api"), "API");
    assert.equal(label("README"), "README");
  });
});
