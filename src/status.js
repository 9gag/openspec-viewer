/**
 * Every capability once, joined with whatever is currently touching it.
 *
 * Board and catalog answer different questions and split for testability the same way
 * `deltasInDevelopment`/`capabilityState` already do — this is the seam between them, so
 * both stay pure and both stay testable without a store on disk.
 */

/** Every group's owner on a change, deduped, unassigned dropped. */
export function ownersOf(change) {
  const seen = new Set();
  for (const group of change.groups ?? []) if (group.owner) seen.add(group.owner);
  return [...seen];
}

/**
 * One row per capability, its in-development history resolved against the board's own
 * changes.
 *
 * `history`'s `change` ids and the board's `changes` are not drawn from the same set —
 * `history` walks every change directory in this checkout, the board excludes whatever
 * `syncState()` already finds archived on main — so a resolved id can come back absent.
 * That is `StoreWarnings`'s own "already archived on main" case, not a bug: `touching[i].change`
 * is null rather than thrown for it, and the caller decides how to say so.
 */
export function statusRows(specs, changes) {
  const byId = new Map(changes.map((change) => [change.id, change]));
  return specs.map((cap) => ({
    ...cap,
    touching: (cap.history ?? [])
      .filter((entry) => !entry.archived)
      .map((entry) => ({
        changeId: entry.changeId,
        kinds: entry.kinds,
        change: byId.get(entry.change) ?? null,
      })),
  }));
}
