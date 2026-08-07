/**
 * The designer's files for a change.
 *
 * Its own module to keep `board.mjs` and `change.mjs` from importing each other: the
 * board needs the summary, the change page needs the bodies, and the change page already
 * needs the board's tasks.md parser.
 */

import { join } from "node:path";

import { files, lastCommit, read } from "./store.mjs";

/**
 * Designer artifacts, joined to the change by directory name.
 *
 * `design/<change-id>/` is the convention the store already uses, and those files
 * already carry a `Change:` line in their header, so the id is the join key. Nothing
 * in the specs links back to them, which is exactly why they need surfacing here.
 */
export function designArtifacts(storePath, changeId) {
  const dir = join(storePath, "design", changeId);
  return files(dir).map((name) => {
    const text = read(join(dir, name)) ?? "";
    const rel = `design/${changeId}/${name}`;
    return {
      name,
      path: rel,
      title: text.match(/^#\s+(.+)$/m)?.[1] ?? name,
      // The header line reads "Owner: design · Change: <id> · Status: ready for build".
      status: text.match(/Status:\s*([^\n·]+)/)?.[1]?.trim() ?? null,
      commit: lastCommit(storePath, rel),
      text,
    };
  });
}

/**
 * Just enough about the designer's files for the board: whether they exist and what they
 * claim. No bodies and no git — designArtifacts() does both, which is right for one
 * change page and wrong for something the board re-reads every few seconds.
 */
export function designSummary(storePath, changeId) {
  const dir = join(storePath, "design", changeId);
  return files(dir).map((name) => {
    const text = read(join(dir, name)) ?? "";
    return {
      name,
      title: text.match(/^#\s+(.+)$/m)?.[1] ?? name,
      status: text.match(/Status:\s*([^\n·]+)/)?.[1]?.trim() ?? null,
    };
  });
}
