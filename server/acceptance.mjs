/**
 * The small piece of grade10-spec state that the viewer needs before rendering a
 * change: when it was proposed and whether a human accepted its current contract.
 *
 * This deliberately reads only the two fields the viewer owns. The planning store's
 * acceptance record is a larger, versioned document and can grow independently of the
 * viewer. A malformed or incomplete record is treated as unaccepted so a bad file can
 * never make a change look approved.
 */

import { join } from "node:path";

import { read } from "./store.mjs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ACCEPTED_AT_RE = /^\d{4}-\d{2}-\d{2}(?:T|$)/;

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

/**
 * Read the current acceptance record. The root acceptance.json is the authoritative
 * record written by `pnpm spec:accept`; immutable history files are intentionally not
 * consulted because they do not identify which snapshot is current.
 */
export function readAcceptance(storePath, changeId, archived = false) {
  let text;
  try {
    text = read(join(changeDir(storePath, changeId, archived), "acceptance.json"));
  } catch {
    return null;
  }
  return parseAcceptance(text, changeId, archived);
}

export function parseAcceptance(text, changeId, archived = false) {
  if (typeof text !== "string") return null;
  let record;
  try {
    record = JSON.parse(text);
  } catch {
    return null;
  }
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;

  const expectedChange = logicalChangeId(changeId, archived);
  if (record.version !== 2 || record.change !== expectedChange)
    return null;

  const acceptedAt =
    typeof record.acceptedAt === "string" ? record.acceptedAt.trim() : "";
  const reviewedBy =
    typeof record.reviewedBy === "string" ? record.reviewedBy.trim() : "";
  const fingerprint =
    typeof record.fingerprint === "string" ? record.fingerprint.trim() : "";
  if (
    !validAcceptedAt(acceptedAt) ||
    reviewedBy.length === 0 ||
    fingerprint.length === 0
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
