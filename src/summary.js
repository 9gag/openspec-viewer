/**
 * What on this board needs a person to do something.
 *
 * Split out from the views because it is the ranking the whole dashboard is built on,
 * and because counts that quietly drift from the lists they head are the classic way a
 * status strip stops being trusted. One function produces both.
 *
 * Deliberately *not* inventory. "48 specs, 81 archived, 100% complete" describes a store
 * at rest and reads most reassuring exactly when nothing is happening. Every tile here is
 * a queue: it is zero when there is nothing to do, and clicking it shows you the work.
 */

import { level } from "./time.js";

/** The queues a tile can narrow the board to. Order is the strip's reading order. */
export const FILTERS = ["conflicts", "idle", "ready", "unclaimed"];

/**
 * `?filter=idle` so a link can point at the work, not just the page — the same reason the
 * appearance takes one. Transient: selecting a tile does not rewrite the URL, and nothing
 * is persisted.
 */
export function initialFilter() {
  const value = new URLSearchParams(window.location.search).get("filter");
  return FILTERS.includes(value) ? value : null;
}

/** Sync state of the clone, since everything else on the page is read from it. */
function storeState(store) {
  if (!store.git)
    return {
      tone: "error",
      label: "not a git repo",
      detail: "plans cannot be shared",
    };
  if (store.behind > 0) {
    return {
      tone: "error",
      label: `${store.behind} behind`,
      detail: `run ${store.cli} sync`,
    };
  }
  if (store.dirty > 0) {
    return {
      tone: "warning",
      label: `${store.dirty} uncommitted`,
      detail: "unpushed checkmarks are invisible",
    };
  }
  if (store.ahead > 0) {
    return {
      tone: "warning",
      label: `${store.ahead} unpushed`,
      detail: "the team cannot see these yet",
    };
  }
  return {
    tone: "ok",
    label: store.upstream ? "up to date" : "no upstream",
    detail: store.upstream ?? "nothing to be stale against",
  };
}

export function summarize(board) {
  const idle = [];
  const unclaimed = [];
  const ready = [];

  for (const ch of board.changes) {
    for (const group of ch.groups) {
      const tone = level(group.idle);
      if (tone === "stale" || tone === "quiet")
        idle.push({ change: ch.id, group, tone });
      else if (!group.owner && group.done < group.total)
        unclaimed.push({ change: ch.id, group });
    }

    // Every task checked off and still in development. The CLI says so when the last box is
    // ticked, but only to whoever ticked it — this is the standing version of that, and
    // archiving is the one thing on this board that is PM's alone.
    if (!ch.planning && ch.total > 0 && ch.done === ch.total) ready.push(ch.id);
  }

  return {
    idle,
    unclaimed,
    ready,
    conflicts: board.conflicts ?? [],
    store: storeState(board.store),
  };
}

/**
 * The one thing a change most needs a person to know, ranked the way the strip ranks it.
 *
 * The nav shows one dot per change, and a dot can only say one thing — so it says the
 * most urgent, in the strip's own reading order: an idle claim outranks a change that is
 * ready to archive, which outranks work nobody has picked up. Anything else is progress,
 * or the absence of it.
 *
 * Shares `summarize`'s rules rather than restating them, for the same reason the counts
 * and the panels come from one function: a dot that disagrees with the tile above it is
 * worse than no dot.
 */
export function changeState(change) {
  if (change.planning) return { variant: "neutral", label: "planning" };

  let quiet = false;
  let unclaimed = false;
  for (const group of change.groups ?? []) {
    const tone = level(group.idle);
    if (tone === "stale") return { variant: "error", label: "idle claim" };
    if (tone === "quiet") quiet = true;
    else if (!group.owner && group.done < group.total) unclaimed = true;
  }

  if (quiet) return { variant: "warning", label: "idle claim" };
  if (change.total > 0 && change.done === change.total)
    return { variant: "success", label: "ready to archive" };
  if (unclaimed) return { variant: "warning", label: "unclaimed work" };
  if (change.done > 0) return { variant: "accent", label: "in progress" };
  return { variant: "neutral", label: "not started" };
}

/**
 * The changes named in a conflict.
 *
 * One function because two readings mark them: the tile filters the full board down to
 * these, and the simplified board badges these rows. A change that is dangerous to
 * archive in one reading and unremarkable in the other is the same drift the counts and
 * the panels are kept together to avoid.
 */
export function conflictingChanges(conflicts) {
  return new Set(conflicts.flatMap((c) => c.changes.map((u) => u.change)));
}

/**
 * The queues the simplified board counts, one line per change rather than per group.
 *
 * Queues, not one exclusive state: a change can be finished *and* in a conflict, and that
 * is the most dangerous line on the board — it is the one about to be archived into the
 * hazard. Counting it once would put it in whichever bucket happened to be tested first
 * and leave the chip disagreeing with the banner that names it, which is the same drift
 * `summarize` exists to prevent. So the counts deliberately do not sum to the total.
 *
 * A change still being planned is in none of them: it has no tasks.md, so it has not
 * started in a sense that "not started" does not mean, and saying otherwise would put
 * work that was never written down in the queue of work nobody has picked up.
 */
export function changeQueues(summary) {
  const conflicted = conflictingChanges(summary.conflicts);

  return [
    {
      key: "ready",
      label: "Ready to archive",
      tone: "success",
      has: (ch) => summary.ready.includes(ch.id),
    },
    {
      key: "conflicts",
      label: "Conflicts",
      tone: "warning",
      has: (ch) => conflicted.has(ch.id),
    },
    {
      key: "moving",
      label: "In progress",
      tone: "accent",
      has: (ch) => !ch.planning && ch.done > 0 && ch.done < ch.total,
    },
    {
      key: "unstarted",
      label: "Not started",
      tone: "neutral",
      has: (ch) => !ch.planning && ch.total > 0 && ch.done === 0,
    },
  ];
}

/**
 * The board, narrowed to what a tile is about.
 *
 * Group-level filters (idle, unclaimed) drop the groups that do not match rather than
 * only the changes, so clicking "2 idle claims" shows two rows, not two tables you still
 * have to read. Change-level filters (ready, conflicts) keep whole changes, because
 * "ready to archive" is a fact about the change and not about any one group.
 */
export function applyFilter(changes, filter, summary) {
  if (!filter) return changes;

  if (filter === "ready")
    return changes.filter((ch) => summary.ready.includes(ch.id));

  if (filter === "conflicts") {
    const ids = conflictingChanges(summary.conflicts);
    return changes.filter((ch) => ids.has(ch.id));
  }

  const keep = new Map();
  for (const entry of filter === "idle" ? summary.idle : summary.unclaimed) {
    if (!keep.has(entry.change)) keep.set(entry.change, new Set());
    keep.get(entry.change).add(entry.group.num);
  }

  return changes
    .filter((ch) => keep.has(ch.id))
    .map((ch) => ({
      ...ch,
      groups: ch.groups.filter((g) => keep.get(ch.id).has(g.num)),
    }));
}
