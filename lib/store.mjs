/**
 * The store-side inferences, for a tool that is not this one.
 *
 * Two facts in this package are not file reads: how long a claim has sat without
 * progress, and which capabilities two in-development changes both delta. Neither is
 * anything to do with a dashboard — they are readings of an OpenSpec store, and another
 * tool over the same store wants the same answers rather than a second implementation
 * of them that drifts.
 *
 * So this is a façade, and it is the whole contract. Everything under `server/` is
 * internal and moves whenever the views need it to; what is re-exported here does not
 * change shape without a major version. A consumer that reaches past this file into
 * `server/` is pinning itself to a layout nobody promised to keep.
 *
 * Node only. Every function here takes an explicit store path and reads disk or git
 * from it — nothing resolves a store of its own, and nothing spawns the openspec CLI,
 * so a build that already knows where its store is can call these without a CLI on
 * PATH. The isomorphic half of the package is `lib/spec.mjs`, which touches neither.
 */

export {
  /** Task groups, owners and checkboxes from one `tasks.md`. */
  parse as parseTasks,
  /** One change's `tasks.md` at every commit that touched it, newest first. */
  snapshots,
  /** How long a claimed, unfinished group has sat without progress. */
  idleness,
} from "../server/board.mjs";

export {
  /** Every in-development delta in the store, keyed by capability. */
  deltasInDevelopment,
  /** Capabilities two or more in-development changes both delta. */
  conflicts,
  /** Shipped, unshipped or retired, from a capability's baseline and history. */
  capabilityState,
} from "../server/catalog.mjs";

export {
  /** Change ids in development — the archive is not one of them. */
  changeIds,
} from "../server/store.mjs";
