/**
 * Everything that touches the store. Runs in Node inside the Vite dev server, never
 * in the browser — the store is a git working copy on disk, not an API.
 *
 * Read-only, on purpose. Claims and checkmarks are commits the CLI's `claim` / `done` /
 * `unclaim` record on the store's main, and `git log` on a change's tasks.md there is
 * the build log. A viewer that could edit would break both.
 *
 * What this adds over the CLI is staleness. The board can only show that @dana
 * owns group 5; it cannot show that the claim landed six days ago and nothing has
 * been checked off since, which is the signal the whole claim-at-pickup convention
 * is worried about. Git already knows: every claim and every checkmark is a commit
 * against one file, so that file's own history answers it exactly.
 */

import { join } from "node:path";

import { changeArtifacts } from "./artifacts.mjs";
import { conflicts } from "./catalog.mjs";
import {
  capabilityDirs,
  catFile,
  git,
  headSignature,
  mainOf,
  read,
  resolveRoot,
  storeStatus,
  syncState,
} from "./store.mjs";

/**
 * Task groups for one change. Same three regexes as scripts/openspec/plan.mjs — the
 * ownership convention is a text convention, and this is the third place that parses it.
 *
 * A task is one markdown list item, not one line: authors hard-wrap tasks.md at the
 * usual column, so the indented lines under a `- [ ]` carry the rest of the sentence.
 * Reading only the first line cut every wrapped task off mid-phrase, which is exactly
 * where the instruction lives.
 */
export function parse(text) {
  const groups = [];
  // The task still open for continuation lines. Anything that starts a new block —
  // a heading, another list item, a blank line — closes it.
  let current = null;
  for (const line of text.split("\n")) {
    const heading = line.match(/^##\s+(\d+)\.\s*(.+?)\s*$/);
    if (heading) {
      const [, num, rest] = heading;
      const owner = rest.match(/\(owner:\s*@?([\w.-]+)\)/i);
      const handle = owner ? owner[1].toLowerCase() : null;
      groups.push({
        num,
        title: rest.replace(/\s*\(owner:[^)]*\)\s*$/i, ""),
        owner: handle && handle !== "unassigned" ? handle : null,
        tasks: [],
      });
      current = null;
      continue;
    }
    const task = line.match(/^\s*-\s*\[([ xX])\]\s*(\S+)\s+(.*)$/);
    if (task && groups.length) {
      current = {
        done: task[1].toLowerCase() === "x",
        id: task[2],
        text: task[3].trim(),
      };
      groups.at(-1).tasks.push(current);
      continue;
    }
    // Indented and not a list item of its own: the wrapped remainder of the task
    // above. Unindented prose is a paragraph between items, and ends the task.
    if (current && /^\s+\S/.test(line) && !/^\s*[-*+]\s/.test(line)) {
      current.text = `${current.text} ${line.trim()}`.trim();
      continue;
    }
    current = null;
  }
  return groups;
}

const tasksPath = (changeId) => `openspec/changes/${changeId}/tasks.md`;

/**
 * A file at one commit, as `git cat-file` names it. `./` reads the path from the store
 * rather than from the git root, for a store that sits below it.
 */
const refAt = (commit, rel) => `${commit}:./${rel}`;

/**
 * Each change's tasks.md at one commit, keyed by id, null where it has none. One
 * `git cat-file` for all of them, since the board reads every change on every poll.
 */
function tasksAt(storePath, commit, ids) {
  const texts = catFile(
    storePath,
    ids.map((id) => refAt(commit, tasksPath(id))),
  );
  return new Map(
    ids.map((id) => [id, texts.get(refAt(commit, tasksPath(id)))]),
  );
}

/** One change's task groups at one commit, or null where it has no tasks.md there. */
export function groupsAt(storePath, commit, changeId) {
  const text = tasksAt(storePath, commit, [changeId]).get(changeId);
  return text === null ? null : parse(text);
}

/**
 * The working-copy state of one change, or null while it is still being planned.
 *
 * An archived change's tasks.md lives one directory deeper and is frozen: it is the
 * record of what shipped and who owned each group, which nothing else in the store
 * keeps once the change leaves the board.
 */
export function readGroups(storePath, changeId, archived = false) {
  const dir = archived
    ? join(storePath, "openspec", "changes", "archive", changeId)
    : join(storePath, "openspec", "changes", changeId);
  const text = read(join(dir, "tasks.md"));
  return text === null ? null : parse(text);
}

/**
 * What this change's tasks.md looked like at every commit that touched it, newest
 * first, each snapshot parsed into groups.
 *
 * Reading the file's own state is deliberate: deriving this from commit subjects
 * instead would mean staleness silently breaking the day someone rewords a commit,
 * amends one, or edits a heading by hand — and the fixtures in this store were
 * authored in bulk commits that no subject pattern matches. State is state.
 *
 * Two spawns per change: the log, then one `git cat-file --batch` for every version of
 * the file at once. A `git show` each was the honest way to write it and the reason the
 * board took seconds — the set is small per change, but the board reads every change in
 * flight on every poll, and it is process startup being paid, not git.
 */
const snapshotCache = new Map();

/**
 * Read back from `commit` when one is given — a full commit id, the store's main, where
 * claims and checkmarks are recorded — and from HEAD otherwise.
 *
 * Rebuilt when that commit moves, for the reason the commit index is: this reads committed
 * history and nothing else, so a working tree that changes under it changes no answer
 * here. Worth caching because the board polls every five seconds and this was two git
 * spawns per change on every one of them — about 600ms of the poll on a store of
 * twenty-one changes, spent re-deriving a history that had not moved.
 */
export function snapshots(storePath, changeId, commit = null) {
  const head = commit ?? headSignature(storePath);
  const key = `${storePath}\u0000${changeId}`;
  const hit = snapshotCache.get(key);
  if (hit && hit.head === head) return hit.value;

  const value = readSnapshots(storePath, changeId, commit ?? "HEAD");
  snapshotCache.set(key, { head, value });
  return value;
}

function readSnapshots(storePath, changeId, rev) {
  const rel = tasksPath(changeId);
  const log = git(storePath, ["log", "--format=%H %ct", rev, "--", rel]);
  if (!log) return [];

  const commits = log
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split(" "));
  const texts = catFile(
    storePath,
    commits.map(([sha]) => refAt(sha, rel)),
  );

  const out = [];
  for (const [sha, when] of commits) {
    const text = texts.get(refAt(sha, rel));
    if (text === null) continue; // the commit that deleted or renamed it
    out.push({ sha, at: Number(when) * 1000, groups: indexByNum(parse(text)) });
  }
  return out;
}

const indexByNum = (groups) => new Map(groups.map((g) => [g.num, g]));

/**
 * How long a claimed group has been sitting without progress.
 *
 * Only meaningful for a group with an owner and unfinished tasks: an unclaimed group
 * already reads as unclaimed, and a finished one is not idle, it is done.
 *
 * `since` is the later of two things, so picking a group up and checking one box
 * resets the clock:
 *   claimed  — when the current owner's unbroken hold on the group began
 *   progress — the newest commit that added a checkmark to it
 *
 * Null when the file's history cannot account for the current owner at all (a store
 * whose history was rewritten, or a tag added in the working copy and never
 * committed). "Idle for ages" inferred from missing history is a guess dressed as
 * data, and the unclaim nudge it would trigger would be aimed at the wrong person.
 */
export function idleness(group, snaps, now) {
  if (!group.owner) return null;
  if (group.tasks.length > 0 && group.tasks.every((t) => t.done)) return null;

  const at = (i) => snaps[i]?.groups.get(group.num);
  const doneIn = (i) => at(i)?.tasks.filter((t) => t.done).length ?? 0;

  // The newest commit must already show this owner holding the group. If it does not,
  // the tag reached the working copy some other way and there is nothing to date from.
  if (at(0)?.owner !== group.owner) return null;

  // Walk back while the same owner still holds it: the oldest snapshot that is still
  // theirs is where this stretch of ownership began. Re-claiming after someone else
  // held it starts a new stretch, which is the point of measuring it this way.
  let start = 0;
  while (at(start + 1)?.owner === group.owner) start++;
  const claimedAt = snaps[start].at;

  // The newest commit that raised the checked count — searched only within this
  // owner's stretch, so the previous owner's progress is never credited to them. The
  // claim commit itself can carry progress, since `done` claims as it completes.
  let progressAt = null;
  for (let i = 0; i <= start; i++) {
    if (doneIn(i) > doneIn(i + 1)) {
      progressAt = snaps[i].at;
      break;
    }
  }

  const since = Math.max(claimedAt, progressAt ?? 0);
  return {
    since,
    days: Math.floor((now - since) / 86_400_000),
    source: (progressAt ?? 0) >= claimedAt ? "progress" : "claim",
  };
}

/**
 * The whole board, as JSON. Throws if the store cannot be resolved at all. `root` is the
 * resolved store, passed by a test that has a clone and no CLI to resolve one.
 */
export function board(now = Date.now(), root = resolveRoot()) {
  const main = mainOf(root.path);
  // Claims and checkmarks are commits on main, so a task list main holds is read there —
  // with its history — whether or not this checkout has it. A plan main does not hold yet
  // is read from disk, and so is every change in a clone with no main.
  const sync = syncState(root.path, main);
  const tasksOnMain = main
    ? tasksAt(root.path, main.commit, sync.onMain)
    : new Map();
  const store = {
    ...storeStatus(root, main),
    unmerged: sync.unmerged,
    archived: sync.archived,
    differs: sync.differs,
  };

  return {
    generatedAt: now,
    store,
    // A directory scan per change, and the warning PM most needs before the archive that would
    // expose it. Over the board's own rows, so a change main has archived is in no conflict.
    conflicts: conflicts(root.path, sync.changes),
    // `capabilities` is the paths only, walked with capabilityDirs rather than read with
    // capabilities() from change.mjs: the nav groups a change by the namespaces it deltas,
    // and a namespace is in the directory name. Reading the deltas for their kinds as well
    // would put a file read per capability per change on every poll to learn nothing this
    // needs.
    changes: sync.changes.map((id) => {
      // The plan is read at main where main holds one. A tasks.md only this checkout has —
      // written on a planning branch, or not committed at all — is read here, exactly as a
      // change main does not have is: the work is there to read, and no claim on it has
      // landed. Reading it at main regardless said a change with a task list on disk had
      // none, while the artifacts beside it said the file was there.
      const atMain = tasksOnMain.get(id) ?? null;
      const commit = atMain === null ? null : main.commit;
      const text = atMain ?? read(join(root.path, tasksPath(id)));
      const groups = text === null ? null : parse(text);
      // Where the groups came from, since only a plan on main can be claimed.
      const planOnMain = commit !== null;
      // Names and presence only. This runs for every change on every poll, so it stays
      // two readdirs — no file bodies, no git.
      const artifacts = changeArtifacts(
        root.path,
        join("openspec", "changes", id),
      ).map(({ name, label, present, declared }) => ({
        name,
        label,
        present,
        declared,
      }));
      const capabilities = capabilityDirs(
        join(root.path, "openspec", "changes", id, "specs"),
      );
      if (!groups) {
        return {
          id,
          planOnMain,
          planning: true,
          done: 0,
          total: 0,
          groups: [],
          lastActivity: null,
          artifacts,
          capabilities,
        };
      }

      const snaps = store.git ? snapshots(root.path, id, commit) : [];

      return {
        id,
        planOnMain,
        planning: false,
        done: groups.reduce(
          (n, g) => n + g.tasks.filter((t) => t.done).length,
          0,
        ),
        total: groups.reduce((n, g) => n + g.tasks.length, 0),
        lastActivity: snaps[0]?.at ?? null,
        artifacts,
        capabilities,
        groups: groups.map((g) => {
          const done = g.tasks.filter((t) => t.done).length;
          return {
            num: g.num,
            title: g.title,
            owner: g.owner,
            done,
            total: g.tasks.length,
            open: g.tasks
              .filter((t) => !t.done)
              .map((t) => ({ id: t.id, text: t.text })),
            idle: idleness(g, snaps, now),
          };
        }),
      };
    }),
  };
}
