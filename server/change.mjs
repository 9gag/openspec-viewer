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

import {
  capabilityDocs,
  changeArtifacts,
  completeness,
  readDocs,
} from "./artifacts.mjs";
import { groupsAt, readGroups } from "./board.mjs";
import { modifiedDrift } from "./deltas.mjs";
import { checkReferences } from "./references.mjs";
import {
  capabilityDirs,
  changeIds,
  changesAt,
  dirs,
  files,
  lastCommit,
  mainOf,
  openspecText,
  read,
  resolveRoot,
} from "./store.mjs";

/**
 * The capabilities this change touches, and whether each is new or a change to shipped
 * behavior.
 *
 * Touches rather than deltas: a capability directory is opened by whichever document is
 * written into it first, and under a schema that has the journeys written ahead of the
 * requirements that is not the spec. One with no `spec.md` yet comes back with no kinds
 * and an empty text, carrying the documents that *are* there — which is the whole reason
 * it has to be listed, since the tabs for those documents are gathered from here.
 */
export function capabilities(storePath, changeId, archived = false) {
  const base = archived
    ? join(storePath, "openspec", "changes", "archive", changeId, "specs")
    : join(storePath, "openspec", "changes", changeId, "specs");

  const rel = `openspec/changes/${archived ? "archive/" : ""}${changeId}/specs`;

  return capabilityDirs(base).map((cap) => {
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
      path: `${rel}/${cap}/spec.md`,
      // Read against the baseline the fold will actually match on, which is the shipped
      // spec as it stands today — not as it stood when the delta was written, and not as
      // another in-development change is about to leave it. That second case is the
      // conflict the board already counts, and this is the same hazard caught later:
      // by the time the first change archives, this one's headings may no longer match.
      drift: modifiedDrift(
        text,
        read(join(storePath, "openspec", "specs", cap, "spec.md")),
      ),
      // Listed, not read: this runs for every change on every board poll, and only the
      // change page renders them. `change()` reads the bodies it is about to send.
      docs: capabilityDocs(join(base, cap), `${rel}/${cap}`),
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

/** `root` is the resolved store, as `board()` takes it. */
export function change(changeId, root = resolveRoot()) {
  const inDevelopment = changeIds(root.path).includes(changeId);
  const archived =
    !inDevelopment &&
    dirs(join(root.path, "openspec", "changes", "archive")).includes(changeId);
  // Owners and checkmarks as the board reads them: at main, for a change in development there.
  const main = archived ? null : mainOf(root.path);
  const onMain =
    main !== null &&
    changesAt(root.path, main.commit).inDevelopment.includes(changeId);
  if (!inDevelopment && !archived) {
    // The board lists it, read at main, but a change's artifacts are this checkout's copy.
    return onMain
      ? {
          error: `${changeId} is in development on ${main.ref}, and not in development in this checkout, whose copy of a change is what this page reads.`,
        }
      : null;
  }

  const dir = archived
    ? join("openspec", "changes", "archive", changeId)
    : join("openspec", "changes", changeId);
  const groups = onMain
    ? groupsAt(root.path, main.commit, changeId)
    : readGroups(root.path, changeId, archived);

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
        entry.file = file;
        // A capability document is one file per delta rather than one on the change, so
        // there is no single path to give it: its copies ride on `capabilities` below,
        // with their text and history, and the tab gathers them by this filename.
        if (kind === "capability-doc") return entry;
        entry.path = `${dir}/${file}`;
        entry.commit = lastCommit(root.path, join(dir, file));
        // Only prose is shipped as text: specs and tasks are already on the payload,
        // read structurally, and sending tasks.md twice helps nobody.
        if (kind === "doc") entry.text = read(join(root.path, dir, file));
        return entry;
      }),
    // An archived change is finished, so "what is still missing" is not a question
    // anyone is asking about it.
    completeness: archived ? null : completeness(root.path, dir),
    // The documents beside each delta carry their text here and nowhere else: the page
    // gives them tabs of their own, and this is the only reader that renders them.
    capabilities: capabilities(root.path, changeId, archived).map((cap) => ({
      ...cap,
      docs: readDocs(root.path, cap.docs),
    })),
    groups: groups?.map((g) => ({
      num: g.num,
      title: g.title,
      owner: g.owner,
      tasks: g.tasks,
    })),
    // Every document this change carries, checked against every id the store defines.
    // Its own files only: an id cited somewhere else in the store is somebody else's
    // page to answer for, and a change page that reported them would never be clean.
    references: checkReferences(root.path, changeDocuments(root.path, dir)),
  };
}

/**
 * Every markdown file a change holds — its own artifacts and everything under its spec
 * deltas — as `[{ path, text }]`.
 *
 * Read here rather than reusing what the payload already carries, because the payload
 * deliberately does not carry all of it: tasks.md and the specs are sent structurally
 * rather than as text, and those two are exactly where a task names the scenario it makes
 * pass and a journey names the scenarios that accept it.
 */
function changeDocuments(storePath, dir) {
  const out = [];

  const walk = (rel) => {
    for (const file of files(join(storePath, rel)))
      out.push({
        path: `${rel}/${file}`,
        text: read(join(storePath, rel, file)),
      });
    for (const sub of dirs(join(storePath, rel))) walk(`${rel}/${sub}`);
  };

  walk(dir);
  return out;
}
