/**
 * One change, in full: every artifact its schema asked for and every file it actually
 * carries, plus whether it validates.
 *
 * The point of rendering all of it here is that today the artifacts are only reachable
 * through `openspec show` in a terminal, one at a time. PM writes the proposal,
 * engineering builds from the tasks, design owns the ui spec — and nobody outside a
 * terminal can see them side by side.
 */

import { join } from "node:path";

import { changeArtifacts } from "./artifacts.mjs";
import { readGroups } from "./board.mjs";
import {
  changeIds,
  dirs,
  files,
  lastCommit,
  openspecJson,
  openspecText,
  read,
  resolveRoot,
  specDirs,
} from "./store.mjs";

const statusCache = new Map();

/**
 * A cheap stand-in for "have this change's files changed": the sorted list of files in
 * the change directory and its spec subdirectories.
 *
 * Completeness is exactly a question about which files exist, so this signature changes
 * precisely when the answer could. Two readdirs, versus a two-second CLI spawn.
 */
function fileSignature(storePath, dir) {
  const base = join(storePath, dir);
  const specs = join(base, "specs");
  return [
    ...files(base),
    ...specDirs(specs).flatMap((cap) =>
      files(join(specs, cap)).map((f) => `specs/${cap}/${f}`),
    ),
  ].join("|");
}

/**
 * Which of the artifacts the schema expects exist, straight from the CLI rather than by
 * guessing at filenames — `openspec status --json` reports the schema's expected output path for each
 * artifact and which files actually match it, so a schema change cannot silently make
 * this wrong. Cached against the file signature so the cost is paid once per real change.
 */
function artifactStatus(changeId, signature) {
  const hit = statusCache.get(changeId);
  if (hit && hit.signature === signature) return hit.value;

  let status;
  try {
    status = openspecJson(["status", "--change", changeId]);
  } catch {
    return null;
  }

  const root = status.changeRoot;
  const out = [];
  for (const [name, info] of Object.entries(status.artifactPaths ?? {})) {
    const paths = (info.existingOutputPaths ?? []).map((p) =>
      p.replace(`${root}/`, ""),
    );
    out.push({
      name,
      expected: info.outputPath,
      present: paths.length > 0,
      paths,
    });
  }

  statusCache.set(changeId, { signature, value: out });
  return out;
}

/** The capabilities this change deltas, and whether each is new or a change to shipped behavior. */
export function capabilities(storePath, changeId, archived = false) {
  const base = archived
    ? join(storePath, "openspec", "changes", "archive", changeId, "specs")
    : join(storePath, "openspec", "changes", changeId, "specs");

  return specDirs(base).map((cap) => {
    const text = read(join(base, cap, "spec.md")) ?? "";
    // A delta that rewrites shipped behavior carries `## MODIFIED Requirements`; a new
    // capability opens with `## Purpose`. This is the distinction that decides whether
    // archiving it can collide with another change, so it is worth surfacing.
    const kinds = [
      ...text.matchAll(
        /^##\s+(ADDED|MODIFIED|REMOVED|RENAMED)\s+Requirements/gim,
      ),
    ].map((m) => m[1].toUpperCase());
    return {
      capability: cap,
      kinds: kinds.length
        ? [...new Set(kinds)]
        : text.includes("## Purpose")
          ? ["NEW"]
          : [],
      requirements: (text.match(/^###\s+Requirement:/gim) ?? []).length,
      scenarios: (text.match(/^####\s+Scenario:/gim) ?? []).length,
      path: `openspec/changes/${archived ? `archive/${changeId}` : changeId}/specs/${cap}/spec.md`,
      text,
    };
  });
}

/**
 * `validate --strict` for one change: what PM runs before pushing, run for them.
 *
 * Its own endpoint, because it is the only remaining call that spawns the openspec CLI
 * (~2s). Folded into the change payload it delayed every artifact on the page behind a
 * check that belongs in the margin.
 */
export function validate(changeId) {
  const res = openspecText(["validate", changeId, "--strict"]);
  return {
    ok: res.ok,
    output: res.out
      .split("\n")
      .filter((l) => !l.startsWith("Using OpenSpec root:"))
      .join("\n"),
  };
}

export function change(changeId) {
  const root = resolveRoot();
  const inDevelopment = changeIds(root.path).includes(changeId);
  const archived =
    !inDevelopment &&
    dirs(join(root.path, "openspec", "changes", "archive")).includes(changeId);
  if (!inDevelopment && !archived) return null;

  const dir = archived
    ? join("openspec", "changes", "archive", changeId)
    : join("openspec", "changes", changeId);
  const groups = readGroups(root.path, changeId, archived);

  return {
    id: changeId,
    archived,
    dir,
    // Only the artifacts that exist — this is what the page turns into tabs, and a tab
    // onto a file nobody has written is a dead end. What is *missing* is a different
    // question, and `completeness` below answers it against the schema's own list.
    artifacts: changeArtifacts(root.path, dir)
      .filter((a) => a.present)
      .map(({ name, label, kind, file }) => {
        const entry = { name, label, kind };
        if (!file) return entry;
        entry.path = `${dir}/${file}`;
        entry.commit = lastCommit(root.path, join(dir, file));
        // Only prose is shipped as text: specs and tasks are already on the payload,
        // read structurally, and sending tasks.md twice helps nobody.
        if (kind === "doc") entry.text = read(join(root.path, dir, file));
        return entry;
      }),
    completeness: archived
      ? null
      : artifactStatus(changeId, fileSignature(root.path, dir)),
    capabilities: capabilities(root.path, changeId, archived),
    groups: groups?.map((g) => ({
      num: g.num,
      title: g.title,
      owner: g.owner,
      tasks: g.tasks,
    })),
  };
}
