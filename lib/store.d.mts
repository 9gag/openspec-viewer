/**
 * Types for `@seankcw/openspec-viewer/lib/store`.
 *
 * Hand-written, because the package is plain JavaScript and always has been: a build
 * step to emit these would put a compiler between a consumer and four functions. They
 * are checked by `test/lib.test.mjs`, which calls every export and asserts the shapes
 * described here, so a change to a return value fails the tests rather than only
 * misleading whoever reads this file.
 */

/** One checklist item of a task group. */
export type Task = {
  done: boolean;
  /** The id the store writes at the head of the line, e.g. `1.3`. */
  id: string;
  text: string;
};

/** A numbered, separately owned section of a change's task list. */
export type TaskGroup = {
  /** The heading's number, as written: `## 3. Wire the endpoint`. */
  num: string;
  title: string;
  /** The handle from `(owner: @handle)`, lowercased. Null when unclaimed. */
  owner: string | null;
  tasks: Task[];
};

/** One commit's version of a change's `tasks.md`, parsed. */
export type TaskSnapshot = {
  /** Full commit sha. */
  sha: string;
  /** Commit time in milliseconds. */
  at: number;
  /** The groups at that commit, keyed by `num`. */
  groups: Map<string, TaskGroup>;
};

/** Why a claim's clock reads what it does. */
export type IdleSource = "progress" | "claim";

/** How long a claimed, unfinished group has sat without progress. */
export type Idleness = {
  /** Milliseconds: the later of the claim and the newest checkmark. */
  since: number;
  /** Whole days between `since` and the `now` that was passed in. */
  days: number;
  source: IdleSource;
};

/** One change's delta on one capability, as the capability's history records it. */
export type DeltaEntry = {
  /** The change's directory name — for an archived change, its dated directory. */
  change: string;
  /** The change id without an archive directory's date prefix. */
  changeId: string;
  /** `ADDED`, `MODIFIED`, `REMOVED`, `RENAMED`, or `NEW` for a capability the delta
   * introduces. Empty when the delta names no section at all. */
  kinds: string[];
  archived: boolean;
  /** Milliseconds: for an archived change the day it shipped, taken from its directory's
   * date prefix; for one in development the commit that last touched it, or null with no
   * history. */
  at: number | null;
  /** `YYYY-MM-DD` for an archived change — its directory's date prefix, falling back to
   * the commit that last touched it. Null for a change in development. */
  archivedOn: string | null;
};

/** Two or more in-development changes deltaing one capability. */
export type Conflict = {
  capability: string;
  changes: { change: string; kinds: string[] }[];
  /** Of those changes, the ones carrying a MODIFIED section — the archive-time hazard,
   * as opposed to two changes both naming the capability as new. */
  modifies: string[];
};

/** Shipped has a baseline; the other two are read from the newest delta. */
export type CapabilityState = "shipped" | "unshipped" | "retired";

/**
 * Task groups, owners and checkboxes from the text of one `tasks.md`.
 *
 * A task is one markdown list item rather than one line: a wrapped task's continuation
 * lines carry the rest of the sentence, and reading only the first cuts it off where
 * the instruction lives.
 */
export function parseTasks(text: string): TaskGroup[];

/**
 * One change's `tasks.md` at every commit that touched it, newest first.
 *
 * Reads the file's state at each commit rather than parsing commit subjects, so a
 * reworded or amended commit changes no answer. Empty for a store that is not a git
 * checkout, or a change whose task list has never been committed. Cached against the
 * store's HEAD for the life of the process.
 */
export function snapshots(storePath: string, changeId: string): TaskSnapshot[];

/**
 * How long a claimed group has sat without progress.
 *
 * Null in three cases, each meaning "there is no honest number here": the group is
 * unclaimed, its tasks are all done, or the history cannot account for the current
 * owner. An age inferred from missing history would aim a nudge at the wrong person.
 *
 * @param now Milliseconds, so a caller batching a whole store dates every group from
 * one clock.
 */
export function idleness(
  group: TaskGroup,
  snaps: TaskSnapshot[],
  now: number,
): Idleness | null;

/**
 * Every in-development delta in the store, keyed by capability.
 *
 * @param changeIds Defaults to every change in development.
 */
export function deltasInDevelopment(
  storePath: string,
  changeIds?: string[],
): Map<string, DeltaEntry[]>;

/**
 * Capabilities two or more in-development changes both delta.
 *
 * Git never flags this: each change is its own directory, so both push cleanly. It
 * breaks at archive time, when the second change is written against a baseline the
 * first already rewrote. Empty when nothing overlaps.
 */
export function conflicts(storePath: string, changeIds: string[]): Conflict[];

/**
 * Which of the three states a capability is in.
 *
 * Pure, over a capability's baseline and its delta history. A capability with no
 * baseline is normally behavior a change is bringing in — but one whose newest delta
 * did nothing except remove requirements is behavior the store withdrew, and filing
 * that as work in development points a reader at work nobody is doing.
 */
export function capabilityState(capability: {
  shipped: boolean;
  history: DeltaEntry[];
}): CapabilityState;

/** Change ids in development, from disk. The archive is not one of them. */
export function changeIds(storePath: string): string[];
