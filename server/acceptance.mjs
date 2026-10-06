/**
 * The small piece of grade10-spec state that the viewer needs before rendering a
 * change: when it was proposed and whether a human accepted its current contract.
 *
 * The planning store's acceptance record is a larger, versioned document. The viewer
 * checks the fields that establish its identity and the immutable provenance beside it.
 * A malformed or incomplete record is treated as unaccepted so a bad file can never
 * make a change look approved.
 */

import { createHash } from "node:crypto";
import { join, posix, relative } from "node:path";

import { read } from "./store.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCEPTED_AT_RE = /^\d{4}-\d{2}-\d{2}(?:T|$)/;
const SHA256_RE = /^[a-f0-9]{64}$/;
const ARTIFACT_ROLES = new Set([
  "change-input",
  "durable-result",
  "prd-source",
]);

const hash = (value) => createHash("sha256").update(value).digest("hex");
const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

function changeDir(storePath, changeId, archived) {
  return archived
    ? join(storePath, "openspec", "changes", "archive", changeId)
    : join(storePath, "openspec", "changes", changeId);
}

function validDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

/**
 * Read the manifest's `created` scalar without pulling YAML into the viewer. Quoted
 * values and an inline comment are accepted because both are valid YAML scalars;
 * indented entries are not interpreted as the top-level manifest field.
 */
export function proposedAt(storePath, changeId, archived = false) {
  let text;
  try {
    text = read(join(changeDir(storePath, changeId, archived), ".openspec.yaml"));
  } catch {
    return null;
  }
  return parseProposedAt(text);
}

export function parseProposedAt(text) {
  if (typeof text !== "string") return null;
  const line = text.match(/^created:\s*([^\r\n]*?)\s*$/m)?.[1];
  if (line === undefined) return null;

  const value = line
    .replace(/\s+#.*$/, "")
    .trim()
    .replace(/^(?:"([^"]*)"|'([^']*)')$/, (_, doubleQuoted, singleQuoted) =>
      doubleQuoted ?? singleQuoted,
    );
  return validDate(value) ? value : null;
}

function logicalChangeId(changeId, archived) {
  if (!archived) return changeId;
  return changeId.match(/^\d{4}-\d{2}-\d{2}-(.+)$/)?.[1] ?? changeId;
}

function validAcceptedAt(value) {
  return (
    typeof value === "string" &&
    ACCEPTED_AT_RE.test(value.trim()) &&
    Number.isFinite(Date.parse(value.trim()))
  );
}

function safeRelativePath(value) {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0")
  )
    return false;
  const normalized = posix.normalize(value);
  return normalized !== ".." && !normalized.startsWith("../");
}

function validArtifact(artifact, version) {
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact))
    return false;
  if (!safeRelativePath(artifact.path) || !SHA256_RE.test(artifact.sha256 ?? ""))
    return false;
  return ARTIFACT_ROLES.has(artifact.role);
}

function validTargets(targets, changeId) {
  if (!Array.isArray(targets)) return false;
  const paths = new Set();
  for (const target of targets) {
    if (
      !target ||
      typeof target !== "object" ||
      Array.isArray(target) ||
      !safeRelativePath(target.path) ||
      !Array.isArray(target.anchors)
    )
      return false;
    const allowed =
      target.path.startsWith("openspec/specs/") ||
      target.path === `openspec/changes/${changeId}/ui-design.md`;
    if (
      !allowed ||
      paths.has(target.path) ||
      target.anchors.some(
        (anchor) => typeof anchor !== "string" || anchor.trim() === "",
      ) ||
      new Set(target.anchors).size !== target.anchors.length
    )
      return false;
    paths.add(target.path);
  }
  return true;
}

/** Keep the digest check compatible with the workflow's planning-content canonicalization. */
function canonicalPlanningContent(path, text) {
  if (path.endsWith("/tasks.md"))
    return text
      .replace(/^([ \t]*-[ \t]*)\[[ xX]\]/gm, "$1[ ]")
      .replace(/[ \t]+\(owner:\s*[^)]+\)/gi, "")
      .replace(/[ \t]+\*\*Owner:\*\*\s*[^\n]+/gi, "");
  if (!/(?:feature|domain|product|platform)-tcs\.md$/.test(path)) return text;
  return text
    .split("\n")
    .filter(
      (line) =>
        !/^\*\*Status:\*\*/.test(line) &&
        !/^\*\*Drafts styled:\*\*/.test(line) &&
        !/^\s*\* \*\*Status:\*\*/.test(line) &&
        !/^\s*\* \*\*Automation status:\*\*/.test(line),
    )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n");
}

function validSnapshots(readFile, text, acceptance, version) {
  if (typeof readFile !== "function") return false;
  const history = readFile(`acceptance/${acceptance.fingerprint}.json`);
  if (typeof history !== "string" || history !== text) return false;

  const snapshotText = readFile(
    `acceptance/${acceptance.fingerprint}.snapshots.json`,
  );
  if (typeof snapshotText !== "string") return false;

  let saved;
  try {
    saved = JSON.parse(snapshotText);
  } catch {
    return false;
  }
  if (
    !saved ||
    typeof saved !== "object" ||
    Array.isArray(saved) ||
    saved.fingerprint !== acceptance.fingerprint ||
    !Array.isArray(saved.files)
  )
    return false;

  const byKey = new Map();
  for (const entry of saved.files) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !safeRelativePath(entry.path) ||
      typeof entry.role !== "string" ||
      typeof entry.sha256 !== "string" ||
      !SHA256_RE.test(entry.sha256) ||
      typeof entry.contentBase64 !== "string"
    )
      return false;
    const key = `${entry.path}\0${entry.role ?? ""}`;
    if (byKey.has(key)) return false;
    byKey.set(key, entry);
  }

  for (const artifact of acceptance.artifacts) {
    const snapshot = byKey.get(`${artifact.path}\0${artifact.role ?? ""}`);
    if (
      !snapshot ||
      snapshot.sha256 !== artifact.sha256 ||
      Buffer.from(snapshot.contentBase64, "base64").toString("base64") !==
        snapshot.contentBase64 ||
      hash(
        canonicalPlanningContent(
          artifact.path,
          Buffer.from(snapshot.contentBase64, "base64").toString("utf8"),
        ),
      ) !== artifact.sha256
    )
      return false;
  }
  return true;
}

function validLegacyInputs(readArtifact, acceptance) {
  if (typeof readArtifact !== "function") return false;
  for (const artifact of acceptance.artifacts) {
    if (artifact.role !== "change-input") continue;
    const content = readArtifact(artifact.path);
    if (
      typeof content !== "string" ||
      hash(canonicalPlanningContent(artifact.path, content)) !== artifact.sha256
    )
      return false;
  }
  return true;
}

/** Read the current record and its immutable provenance, without writing to the store. */
export function readAcceptance(storePath, changeId, archived = false) {
  let text;
  try {
    text = read(join(changeDir(storePath, changeId, archived), "acceptance.json"));
  } catch {
    return null;
  }
  const dir = changeDir(storePath, changeId, archived);
  return parseAcceptance(text, changeId, archived, {
    readFile: (relativePath) => read(join(dir, relativePath)),
    readArtifact: (artifactPath) => {
      const direct = read(join(storePath, artifactPath));
      if (direct !== null) return direct;
      if (!archived) return null;
      const logicalId = logicalChangeId(changeId, true);
      const suffix = artifactPath.replace(
        `openspec/changes/${logicalId}/`,
        "",
      );
      const archivedPrefix = relative(storePath, dir);
      return read(join(storePath, archivedPrefix, suffix));
    },
  });
}

/** The current record's digest, used to batch immutable history reads on main. */
export function acceptanceFingerprint(text) {
  if (typeof text !== "string") return null;
  try {
    const value = JSON.parse(text);
    return value &&
      typeof value === "object" &&
      typeof value.fingerprint === "string" &&
      SHA256_RE.test(value.fingerprint)
      ? value.fingerprint
      : null;
  } catch {
    return null;
  }
}

/** The v1 change-input paths whose working copy still belongs in verification. */
export function acceptanceInputPaths(text) {
  if (typeof text !== "string") return [];
  try {
    const value = JSON.parse(text);
    if (!value || typeof value !== "object" || value.version !== 1)
      return [];
    return (Array.isArray(value.artifacts) ? value.artifacts : [])
      .filter(
        (artifact) =>
          artifact?.role === "change-input" &&
          safeRelativePath(artifact.path),
      )
      .map((artifact) => artifact.path);
  } catch {
    return [];
  }
}

export function parseAcceptance(
  text,
  changeId,
  archived = false,
  options = null,
) {
  if (typeof text !== "string") return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;

  const expectedChange = logicalChangeId(changeId, archived);
  if (![1, 2].includes(record.version) || record.change !== expectedChange)
    return null;

  const acceptedAt =
    typeof record.acceptedAt === "string" ? record.acceptedAt.trim() : "";
  const reviewedBy =
    typeof record.reviewedBy === "string" ? record.reviewedBy.trim() : "";
  const fingerprint =
    typeof record.fingerprint === "string" ? record.fingerprint.trim() : "";
  const baseline =
    typeof record.baseline === "string" ? record.baseline.trim() : "";
  if (
    !validAcceptedAt(acceptedAt) ||
    reviewedBy.length === 0 ||
    fingerprint.length === 0 ||
    baseline.length === 0 ||
    !Array.isArray(record.artifacts) ||
    !record.artifacts.every((artifact) => validArtifact(artifact, record.version))
  )
    return null;

  if (!SHA256_RE.test(baseline) || !SHA256_RE.test(fingerprint)) return null;
  if (record.version === 2 && !validTargets(record.contractTargets, expectedChange))
    return null;
  const identity =
    record.version === 2
      ? {
          version: 2,
          change: expectedChange,
          artifacts: record.artifacts,
          contractTargets: record.contractTargets,
        }
      : { version: 1, change: expectedChange, artifacts: record.artifacts };
  if (hash(json(identity)) !== fingerprint) return null;

  const readFile =
    typeof options === "function" ? options : options?.readFile;
  if (!validSnapshots(readFile, text, {
    fingerprint,
    artifacts: record.artifacts,
  }, record.version))
    return null;
  if (
    record.version === 1 &&
    !validLegacyInputs(options?.readArtifact, {
      artifacts: record.artifacts,
    })
  )
    return null;

  return { acceptedAt, reviewedBy, fingerprint };
}

export function changeMetadata(storePath, changeId, archived = false) {
  return {
    proposedAt: proposedAt(storePath, changeId, archived),
    acceptance: readAcceptance(storePath, changeId, archived),
  };
}
