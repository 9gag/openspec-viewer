import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";

import { proposedAt, readAcceptance } from "../server/acceptance.mjs";
import { changeTreeByNamespace } from "../src/capabilities.js";
import { sortChanges } from "../src/change-order.js";

function sandbox() {
  return mkdtempSync(join(tmpdir(), "openspec-viewer-acceptance-"));
}

function digest(character) {
  return character.repeat(64);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function artifactEntries(change) {
  return [
    {
      path: `openspec/changes/${change}/proposal.md`,
      role: "change-input",
      content: `# ${change}\n\nThe card can be added.\n`,
    },
    {
      path: `openspec/specs/store/cart/spec.md`,
      role: "durable-result",
      content:
        "# Cart\n\n### Requirement: Add card\n\nThe cart accepts a card.\n",
    },
    {
      path: "docs/prds/products/store-cart.md#Acceptance",
      role: "prd-source",
      content: "## Acceptance\n\nThe card flow is approved.\n",
    },
  ].sort(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.role.localeCompare(right.role),
  );
}

function acceptanceArtifacts(change) {
  return artifactEntries(change).map(({ content, ...artifact }) => ({
    ...artifact,
    sha256: sha256(content),
  }));
}

function acceptanceFingerprint(version, change, artifacts, contractTargets) {
  const identity =
    version === 2
      ? { version: 2, change, artifacts, contractTargets }
      : { version: 1, change, artifacts };
  return createHash("sha256")
    .update(`${JSON.stringify(identity, null, 2)}\n`)
    .digest("hex");
}

function acceptanceRecord(change, version = 2) {
  const artifacts = acceptanceArtifacts(change);
  const contractTargets = [
    {
      path: "openspec/specs/store/cart/spec.md",
      anchors: ["Requirement: Add card"],
    },
  ];
  return {
    version,
    change,
    baseline: digest("d"),
    fingerprint: acceptanceFingerprint(
      version,
      change,
      artifacts,
      contractTargets,
    ),
    reviewedBy: "@pm",
    acceptedAt: "2026-10-04T10:11:12.000Z",
    artifacts,
    ...(version === 2 ? { contractTargets } : {}),
  };
}

function acceptanceFixture(change, version = 2) {
  const record = acceptanceRecord(change, version);
  const acceptanceText = JSON.stringify(record);
  const files = { "acceptance.json": acceptanceText };
  files[`acceptance/${record.fingerprint}.json`] = acceptanceText;
  files[`acceptance/${record.fingerprint}.snapshots.json`] = JSON.stringify({
    fingerprint: record.fingerprint,
    files: artifactEntries(change).map(({ content, ...artifact }) => ({
      ...artifact,
      sha256: sha256(content),
      contentBase64: Buffer.from(content, "utf8").toString("base64"),
    })),
  });
  if (version === 1)
    files["proposal.md"] = artifactEntries(change).find(
      (artifact) => artifact.role === "change-input",
    ).content;
  return { record, files };
}

function changeDir(root, id, archived = false) {
  return archived
    ? join(root, "openspec", "changes", "archive", id)
    : join(root, "openspec", "changes", id);
}

function writeChange(root, id, files, archived = false) {
  const dir = changeDir(root, id, archived);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), content);
  }
}

test("reads a realistic v2 acceptance record and proposal date", () => {
  const root = sandbox();
  try {
    const fixture = acceptanceFixture("add-card");
    const { record } = fixture;
    writeChange(root, "add-card", {
      ".openspec.yaml":
        "schema: grade10-planning\ncreated: \"2026-10-03\" # interview date\n",
      ...fixture.files,
    });

    assert.equal(proposedAt(root, "add-card"), "2026-10-03");
    assert.deepEqual(readAcceptance(root, "add-card"), {
      acceptedAt: record.acceptedAt,
      reviewedBy: record.reviewedBy,
      fingerprint: record.fingerprint,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not mark forged or incomplete v2 records as accepted", () => {
  const root = sandbox();
  try {
    const incomplete = acceptanceFixture("incomplete-v2").record;
    delete incomplete.artifacts;
    delete incomplete.contractTargets;
    writeChange(root, "incomplete-v2", {
      "acceptance.json": JSON.stringify(incomplete),
    });
    assert.equal(readAcceptance(root, "incomplete-v2"), null);

    const forgedFixture = acceptanceFixture("forged-v2");
    const forged = {
      ...forgedFixture.record,
      fingerprint: digest("f"),
    };
    const forgedFiles = {
      ...forgedFixture.files,
      "acceptance.json": JSON.stringify(forged),
      [`acceptance/${forged.fingerprint}.json`]: JSON.stringify(forged),
      [`acceptance/${forged.fingerprint}.snapshots.json`]: JSON.stringify({
        ...JSON.parse(
          forgedFixture.files[
            `acceptance/${forgedFixture.record.fingerprint}.snapshots.json`
          ],
        ),
        fingerprint: forged.fingerprint,
      }),
    };
    writeChange(root, "forged-v2", {
      ...forgedFiles,
    });
    assert.equal(readAcceptance(root, "forged-v2"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not mark v2 accepted without intact immutable provenance", () => {
  const root = sandbox();
  try {
    const missingHistory = acceptanceFixture("missing-v2-history");
    delete missingHistory.files[
      `acceptance/${missingHistory.record.fingerprint}.json`
    ];
    writeChange(root, "missing-v2-history", missingHistory.files);
    assert.equal(readAcceptance(root, "missing-v2-history"), null);

    const tamperedSnapshot = acceptanceFixture("tampered-v2-snapshot");
    const snapshotPath =
      `acceptance/${tamperedSnapshot.record.fingerprint}.snapshots.json`;
    const snapshot = JSON.parse(tamperedSnapshot.files[snapshotPath]);
    snapshot.fingerprint = digest("e");
    tamperedSnapshot.files[snapshotPath] = JSON.stringify(snapshot);
    writeChange(root, "tampered-v2-snapshot", tamperedSnapshot.files);
    assert.equal(readAcceptance(root, "tampered-v2-snapshot"), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("accepts a workflow-supported v1 acceptance record", () => {
  const root = sandbox();
  try {
    const { record, files } = acceptanceFixture("legacy-card", 1);
    writeChange(root, "legacy-card", {
      ...files,
    });

    assert.deepEqual(readAcceptance(root, "legacy-card"), {
      acceptedAt: record.acceptedAt,
      reviewedBy: record.reviewedBy,
      fingerprint: record.fingerprint,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("does not mark a v1 record accepted after its input changes", () => {
  const root = sandbox();
  try {
    const fixture = acceptanceFixture("changed-legacy-card", 1);
    writeChange(root, "changed-legacy-card", fixture.files);
    assert.ok(readAcceptance(root, "changed-legacy-card"));

    writeFileSync(
      join(changeDir(root, "changed-legacy-card"), "proposal.md"),
      "# changed-legacy-card\n\nA revised card contract.\n",
    );
    assert.equal(readAcceptance(root, "changed-legacy-card"), null);
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
    const fixture = acceptanceFixture("add-card");
    const { record } = fixture;
    writeChange(
      root,
      "2026-10-05-add-card",
      {
        ".openspec.yaml": "created: 2026-09-20\n",
        ...fixture.files,
      },
      true,
    );

    assert.equal(
      proposedAt(root, "2026-10-05-add-card", true),
      "2026-09-20",
    );
    assert.equal(
      readAcceptance(root, "2026-10-05-add-card", true)?.reviewedBy,
      record.reviewedBy,
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
