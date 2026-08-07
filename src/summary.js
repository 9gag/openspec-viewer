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
export const FILTERS = ["collisions", "idle", "ready", "unclaimed"];

/**
 * `?filter=idle` so a link can point at the work, not just the page — the same reason the
 * lens and the appearance take one. Transient: selecting a tile does not rewrite the URL,
 * and nothing is persisted.
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

    // Every task checked off and still in flight. The CLI says so when the last box is
    // ticked, but only to whoever ticked it — this is the standing version of that, and
    // archiving is the one thing on this board that is PM's alone.
    if (!ch.planning && ch.total > 0 && ch.done === ch.total) ready.push(ch.id);
  }

  return {
    idle,
    unclaimed,
    ready,
    collisions: board.collisions ?? [],
    store: storeState(board.store),
  };
}

/**
 * The board, narrowed to what a tile is about.
 *
 * Group-level filters (idle, unclaimed) drop the groups that do not match rather than
 * only the changes, so clicking "2 idle claims" shows two rows, not two tables you still
 * have to read. Change-level filters (ready, collisions) keep whole changes, because
 * "ready to archive" is a fact about the change and not about any one group.
 */
export function applyFilter(changes, filter, summary) {
  if (!filter) return changes;

  if (filter === "ready")
    return changes.filter((ch) => summary.ready.includes(ch.id));

  if (filter === "collisions") {
    const ids = new Set(
      summary.collisions.flatMap((c) => c.changes.map((u) => u.change)),
    );
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
