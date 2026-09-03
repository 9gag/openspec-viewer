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
  capabilityDocs,
  changeArtifacts,
  completeness,
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

/** A document filed beside a capability's spec, where a per-capability artifact writes it. */
function capabilityDoc(dir, cap, file) {
  writeFileSync(join(store, dir, "specs", cap, file), `# ${file}\n`);
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

  it("reads a per-capability artifact as its own document, not the deltas", () => {
    // A schema that writes user journeys per capability declares them over the same
    // directories as the specs. Reading that glob as the deltas gave the artifact a tab
    // onto the requirements, and left the file it actually asked for with no page at all.
    schema("with-journeys", [
      ["specs", "specs/**/spec.md"],
      ["user-journeys", "specs/**/user-journeys.md"],
    ]);
    const dir = change("add-guest-checkout", "with-journeys", [], ["checkout"]);
    capabilityDoc(dir, "checkout", "user-journeys.md");

    assert.deepEqual(changeArtifacts(store, dir), [
      {
        name: "specs",
        label: "Specs",
        kind: "specs",
        declared: true,
        present: true,
      },
      {
        name: "user-journeys",
        label: "User Journeys",
        kind: "capability-doc",
        file: "user-journeys.md",
        declared: true,
        present: true,
      },
    ]);
  });

  it("reports a per-capability artifact no capability has written", () => {
    // The delta is there and its journeys are not, which is exactly the state the tab
    // bar must not paper over: a tab is a file to read, and this one has nothing in it.
    schema("journeys-only", [
      ["specs", "specs/**/spec.md"],
      ["user-journeys", "specs/**/user-journeys.md"],
    ]);
    const dir = change("add-cart-limits", "journeys-only", [], ["cart"]);

    assert.deepEqual(
      changeArtifacts(store, dir).map((a) => [a.name, a.present]),
      [
        ["specs", true],
        ["user-journeys", false],
      ],
    );
  });

  it("falls back to a conventional order when no schema is named", () => {
    const dir = change("unmarked", null, ["tasks.md", "proposal.md"]);

    // Declared by nobody: the order is this tool's convention, so an artifact missing
    // from it is an expectation the tool invented rather than one the store made.
    assert.ok(changeArtifacts(store, dir).every((a) => !a.declared));

    const present = changeArtifacts(store, dir)
      .filter((a) => a.present)
      .map((a) => a.name);
    // Alphabetical would open the change on its task list. The fallback decides only
    // the order; which tabs exist is still whatever is on disk.
    assert.deepEqual(present, ["proposal", "tasks"]);
  });
});

describe("label", () => {
  // A schema names its own artifacts, and the tab shows that name. There is no table of
  // preferred names in front of it: renaming five ids read well for the schemas whose
  // ids those were and left every other store's tab bar speaking two vocabularies.
  it("gives back the name the schema uses, made readable", () => {
    assert.equal(label("proposal"), "Proposal");
    assert.equal(label("specs"), "Specs");
    assert.equal(label("tasks"), "Tasks");
  });

  it("title-cases an id of any shape", () => {
    assert.equal(label("design-notes"), "Design Notes");
    assert.equal(label("user-journeys"), "User Journeys");
    assert.equal(label("rollout"), "Rollout");
  });

  it("leaves acronyms and shouted filenames alone", () => {
    assert.equal(label("api"), "API");
    assert.equal(label("README"), "README");
  });
});

/**
 * What the Artifacts card reads. This used to be `openspec status --change`, and the
 * only reason to have replaced a CLI that is authoritative with a local read is that the
 * local read gives the same answer — so these pin the cases where it could quietly stop
 * doing that.
 */
describe("completeness", () => {
  const declared = [
    ["proposal", "proposal.md"],
    ["specs", '"specs/**/*.md"'],
    ["design", "design.md"],
    ["ui", "ui.md"],
    ["tasks", "tasks.md"],
  ];

  it("answers the schema's list, with what is there and where", () => {
    schema("full-planning", declared);
    const dir = change(
      "add-guest-checkout",
      "full-planning",
      ["proposal.md", "design.md", "tasks.md"],
      ["checkout"],
    );

    assert.deepEqual(completeness(store, dir), [
      {
        name: "proposal",
        expected: "proposal.md",
        present: true,
        paths: ["proposal.md"],
      },
      {
        name: "specs",
        expected: "specs/**/*.md",
        present: true,
        paths: ["specs/checkout/spec.md"],
      },
      {
        name: "design",
        expected: "design.md",
        present: true,
        paths: ["design.md"],
      },
      { name: "ui", expected: "ui.md", present: false, paths: [] },
      {
        name: "tasks",
        expected: "tasks.md",
        present: true,
        paths: ["tasks.md"],
      },
    ]);
  });

  it("falls back to the store's schema for a change that records none", () => {
    // A change made before the CLI started writing `.openspec.yaml` beside its
    // artifacts. Answering from the CLI's built-in default instead of the store's would
    // report artifacts this store's schema never asked for as missing.
    schema("full-planning", declared);
    mkdirSync(join(store, "openspec"), { recursive: true });
    writeFileSync(
      join(store, "openspec", "config.yaml"),
      [
        "schema: full-planning",
        "",
        "context: |",
        "  A store can say anything here, including",
        "  schema: not-this-one",
        "",
      ].join("\n"),
    );
    const dir = change("add-cart-limits", null, ["proposal.md"], []);

    assert.deepEqual(
      completeness(store, dir).map((a) => `${a.name}:${a.present}`),
      [
        "proposal:true",
        "specs:false",
        "design:false",
        "ui:false",
        "tasks:false",
      ],
    );
  });

  it("is absent, not invented, when no schema can be resolved", () => {
    // The change page still gets its tabs, because those are the files that are there
    // and the conventional order is only deciding what order they come in. What it does
    // not get is the card: a *missing* artifact from a list nobody declared is an
    // expectation this tool made up.
    const dir = change("add-back-in-stock-alerts", null, ["proposal.md"], []);
    assert.equal(completeness(store, dir), null);
    assert.deepEqual(
      changeArtifacts(store, dir)
        .filter((a) => a.present)
        .map((a) => a.name),
      ["proposal"],
    );
  });

  it("holds a per-capability artifact to its own filename", () => {
    // Every one of these globs runs over the same directories, so reading them as the
    // deltas reported all three present, with spec.md as the evidence, the moment one
    // capability directory existed — a card that says the change is complete when two
    // of its three artifacts have not been written.
    schema("journeys-and-cases", [
      ["specs", "specs/**/spec.md"],
      ["user-journeys", "specs/**/user-journeys.md"],
      ["test-cases", "specs/**/test-cases.md"],
    ]);
    const dir = change(
      "add-guest-checkout",
      "journeys-and-cases",
      [],
      ["checkout"],
    );
    capabilityDoc(dir, "checkout", "user-journeys.md");

    assert.deepEqual(completeness(store, dir), [
      {
        name: "specs",
        expected: "specs/**/spec.md",
        present: true,
        paths: ["specs/checkout/spec.md"],
      },
      {
        name: "user-journeys",
        expected: "specs/**/user-journeys.md",
        present: true,
        paths: ["specs/checkout/user-journeys.md"],
      },
      {
        name: "test-cases",
        expected: "specs/**/test-cases.md",
        present: false,
        paths: [],
      },
    ]);
  });

  it("counts every spec file a delta wrote, not just the first", () => {
    schema("full-planning", declared);
    const dir = change(
      "add-account-profile",
      "full-planning",
      ["proposal.md"],
      ["store/profile", "shared/ui/profile"],
    );

    const specs = completeness(store, dir).find((a) => a.name === "specs");
    assert.deepEqual(specs.paths, [
      "specs/shared/ui/profile/spec.md",
      "specs/store/profile/spec.md",
    ]);
  });
});

/**
 * A capability directory is not only its spec, and nothing declares what else is in it —
 * a schema names the artifacts a *change* generates and says nothing about the inside of
 * a spec directory. So the listing is the whole rule, and the failure it prevents is the
 * quiet one: a test-cases.md sitting next to the requirements it tests, on disk, with no
 * page that opens it.
 */
describe("capabilityDocs", () => {
  /** A capability directory: its spec, and whatever else is filed with it. */
  function capability(cap, names) {
    const dir = join(store, "openspec", "specs", cap);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "spec.md"), "## Purpose\n");
    for (const name of names) writeFileSync(join(dir, name), `# ${name}\n`);
    return dir;
  }

  it("lists what is filed with a spec, labelled and addressed", () => {
    const dir = capability("storefront/checkout", ["test-cases.md"]);
    assert.deepEqual(
      capabilityDocs(dir, "openspec/specs/storefront/checkout"),
      [
        {
          name: "test-cases",
          label: "Test Cases",
          file: "test-cases.md",
          path: "openspec/specs/storefront/checkout/test-cases.md",
        },
      ],
    );
  });

  it("leaves the spec itself out — it has a page of its own", () => {
    const dir = capability("shared/ui/cart", []);
    assert.deepEqual(capabilityDocs(dir, "openspec/specs/shared/ui/cart"), []);
  });

  it("ignores what it cannot render", () => {
    // Everything the viewer renders is markdown, and a directory that also holds a
    // diagram or a fixture should not offer a tab onto bytes.
    const dir = capability("shared/ui/stock-alerts", ["notes.md", "flow.png"]);
    assert.deepEqual(
      capabilityDocs(dir, "openspec/specs/shared/ui/stock-alerts").map(
        (d) => d.file,
      ),
      ["notes.md"],
    );
  });

  it("is empty for a capability with no directory at all", () => {
    // An unshipped capability has no baseline to sit beside. The detail page asks anyway,
    // because it does not know that until it has asked.
    assert.deepEqual(
      capabilityDocs(
        join(store, "openspec", "specs", "storefront/nothing"),
        "x",
      ),
      [],
    );
  });
});
