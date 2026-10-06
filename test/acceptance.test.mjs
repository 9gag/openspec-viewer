import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { proposedAt, readAcceptance } from "../server/acceptance.mjs";
import { changeTreeByNamespace } from "../src/capabilities.js";
import { sortChanges } from "../src/change-order.js";

function sandbox() {
  return mkdtempSync(join(tmpdir(), "openspec-viewer-acceptance-"));
}

function changeDir(root, id, archived = false) {
  return archived
    ? join(root, "openspec", "changes", "archive", id)
    : join(root, "openspec", "changes", id);
}

function writeChange(root, id, files, archived = false) {
  const dir = changeDir(root, id, archived);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files))
    writeFileSync(join(dir, name), content);
}

test("reads proposal date and the current acceptance fields", () => {
  const root = sandbox();
  try {
    writeChange(root, "add-card", {
      ".openspec.yaml":
        "schema: grade10-planning\ncreated: \"2026-10-03\" # interview date\n",
      "acceptance.json": JSON.stringify({
        version: 2,
        change: "add-card",
        fingerprint: "abc123",
        reviewedBy: "human",
        acceptedAt: "2026-10-04T10:11:12.000Z",
        artifacts: [],
      }),
    });

    assert.equal(proposedAt(root, "add-card"), "2026-10-03");
    assert.deepEqual(readAcceptance(root, "add-card"), {
      acceptedAt: "2026-10-04T10:11:12.000Z",
      reviewedBy: "human",
      fingerprint: "abc123",
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("treats missing, malformed, and incomplete state as unknown", () => {
  const root = sandbox();
  try {
    writeChange(root, "bad-json", {
      ".openspec.yaml": "created: 2026-02-30\n",
      "acceptance.json": "{not json",
    });
    assert.equal(proposedAt(root, "bad-json"), null);
    assert.equal(readAcceptance(root, "bad-json"), null);

    writeChange(root, "missing-fields", {
      "acceptance.json": JSON.stringify({
        acceptedAt: "2026-10-04T10:11:12.000Z",
        reviewedBy: "human",
      }),
    });
    assert.equal(readAcceptance(root, "missing-fields"), null);

    writeChange(root, "wrong-change", {
      "acceptance.json": JSON.stringify({
        change: "some-other-change",
        fingerprint: "abc123",
        reviewedBy: "human",
        acceptedAt: "2026-10-04T10:11:12.000Z",
      }),
    });
    assert.equal(readAcceptance(root, "wrong-change"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("reads accepted state from an archived date-prefixed directory", () => {
  const root = sandbox();
  try {
    writeChange(
      root,
      "2026-10-05-add-card",
      {
        ".openspec.yaml": "created: 2026-09-20\n",
        "acceptance.json": JSON.stringify({
          version: 2,
          change: "add-card",
          fingerprint: "abc123",
          reviewedBy: "human",
          acceptedAt: "2026-10-04T10:11:12.000Z",
        }),
      },
      true,
    );

    assert.equal(
      proposedAt(root, "2026-10-05-add-card", true),
      "2026-09-20",
    );
    assert.equal(
      readAcceptance(root, "2026-10-05-add-card", true)?.reviewedBy,
      "human",
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("sorts unaccepted changes first, then newest proposals, then ids", () => {
  const changes = [
    { id: "z-accepted-old", proposedAt: "2026-09-01", acceptance: {} },
    { id: "b-unaccepted-old", proposedAt: "2026-09-01", acceptance: null },
    { id: "a-unaccepted-new", proposedAt: "2026-10-01", acceptance: null },
    { id: "c-unaccepted-undated", proposedAt: null, acceptance: null },
    { id: "a-accepted-new", proposedAt: "2026-10-01", acceptance: {} },
    { id: "b-accepted-undated", proposedAt: null, acceptance: {} },
  ];

  assert.deepEqual(
    sortChanges(changes).map((change) => change.id),
    [
      "a-unaccepted-new",
      "b-unaccepted-old",
      "c-unaccepted-undated",
      "a-accepted-new",
      "z-accepted-old",
      "b-accepted-undated",
    ],
  );
});

test("pins unaccepted changes first within every namespace", () => {
  const changes = [
    {
      id: "accepted-new",
      proposedAt: "2026-10-06",
      acceptance: {},
      capabilities: ["store/cart", "shared/button"],
    },
    {
      id: "open-old",
      proposedAt: "2026-09-01",
      acceptance: null,
      capabilities: ["store/cart", "shared/button"],
    },
    {
      id: "open-new",
      proposedAt: "2026-10-01",
      acceptance: null,
      capabilities: ["store/cart", "shared/button"],
    },
  ];

  for (const section of changeTreeByNamespace(changes)) {
    assert.deepEqual(
      section.items.map((change) => change.id),
      ["open-new", "open-old", "accepted-new"],
    );
  }
});
