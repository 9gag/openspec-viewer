/**
 * The cross-change view: the shipped baseline, the archive, and the one thing nobody
 * can currently see coming — two in-development changes deltaing the same capability.
 */

import { join } from "node:path";

import { capabilityDocs, readDocs } from "./artifacts.mjs";
import { checkReferences } from "./references.mjs";
import { capabilities } from "./change.mjs";
import {
  changeIds,
  dirs,
  lastCommit,
  read,
  resolveRoot,
  specDirs,
} from "./store.mjs";

/** A commit's day, in the reader's own timezone, as YYYY-MM-DD. */
function dayOf(commit) {
  if (!commit) return null;
  const d = new Date(commit.at);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * When a shipped change shipped, as YYYY-MM-DD.
 *
 * The archive directory's own name says it: `openspec archive` stamps the directory on the
 * day it runs, which is the day PM decided the change was deployed. That is the fact, and
 * it stays true however the directory later travels — through a squash, a rebase, a
 * branch merged weeks afterwards, or a store imported wholesale into a new repository,
 * every one of which rewrites the commit and none of which un-ships anything. A store
 * whose archive arrived in one import has one commit date across all of it, and dating
 * the archive from that turns a year of releases into a single afternoon.
 *
 * The commit is the fallback, for a directory nobody dated.
 */
export const shippedOn = (prefix, commit) => prefix ?? dayOf(commit);

/**
 * The same moment as a number, for ordering.
 *
 * A date is a day and a commit is an instant, so the day is taken at local midnight —
 * the frame the prefix was written in, since `openspec archive` stamps it from the clock
 * of whoever ran it. Zero for a change with neither, which sorts last rather than
 * pretending to be the oldest thing in the store.
 */
export const shippedAt = (prefix, commit) =>
  prefix ? Date.parse(`${prefix}T00:00:00`) : (commit?.at ?? 0);

/**
 * Every in-development delta in the store, by capability.
 *
 * Split out of `capabilityCatalog()` because the contested count needs a seam a test can
 * reach: the catalog resolves its own root and cannot be pointed at a fixture, and a rule
 * about archive-time hazards that only ever runs against the real store passes whether it
 * works or not.
 */
export function deltasInDevelopment(storePath, ids = changeIds(storePath)) {
  const byCapability = new Map();

  for (const id of ids) {
    const at =
      lastCommit(storePath, join("openspec", "changes", id))?.at ?? null;
    for (const cap of capabilities(storePath, id)) {
      if (!byCapability.has(cap.capability))
        byCapability.set(cap.capability, []);
      byCapability.get(cap.capability).push({
        change: id,
        changeId: id,
        kinds: cap.kinds,
        archived: false,
        at,
        archivedOn: null,
      });
    }
  }

  return byCapability;
}

/**
 * The delta that decides a capability's state.
 *
 * In development sorts ahead of everything archived whatever the dates say — it has not landed,
 * so it is the newest thing that happened to the capability. Among archived deltas it is the
 * day each one shipped, which the catalog has already read off the directory's own name.
 */
function newestDelta(history) {
  const rank = (h) => [
    h.archived ? 0 : 1,
    h.at ?? (h.archivedOn ? Date.parse(h.archivedOn) : 0),
  ];

  let best = null;
  for (const h of history) {
    if (best === null) {
      best = h;
      continue;
    }
    const [ar, at] = rank(h);
    const [br, bt] = rank(best);
    if (ar > br || (ar === br && at > bt)) best = h;
  }
  return best;
}

/**
 * Which of the three states a capability is in.
 *
 * Shipped is a fact: there is a baseline in `openspec/specs/`. The other two are the
 * inference. A capability with no baseline is normally behavior a change is still bringing
 * in — but one whose newest delta did nothing except remove requirements is behavior the
 * store withdrew, and filing that under "in development" points a reader at work nobody is
 * doing.
 *
 * REMOVED has to be alone to count. A delta that both adds and removes is a capability
 * being rewritten, not withdrawn, and one re-added after a removal is arriving again — so
 * the newest delta decides and the older ones do not get a vote. RENAMED is deliberately
 * not a withdrawal: a renamed-away capability is left in a state the store does not really
 * describe, and guessing at it would be the confidently-wrong inference this is avoiding.
 *
 * Pure over the entry `capabilityCatalog()` has already built, so every edge is testable
 * without a store on disk.
 */
export function capabilityState({ shipped, history }) {
  if (shipped) return "shipped";
  const kinds = newestDelta(history)?.kinds ?? [];
  return kinds.length === 1 && kinds[0] === "REMOVED" ? "retired" : "unshipped";
}

/**
 * Capabilities two or more in-development changes both touch.
 *
 * This is the archive-time hazard, and git never flags it: each change is its own
 * folder, so both push cleanly. It breaks later, when the second change
 * archives against a baseline the first one already rewrote — and a MODIFIED block
 * whose headers no longer match the baseline silently drops the rest of the
 * requirement. By then the plan and the specs disagree and nothing said so.
 *
 * Sequencing them is a planning decision, so all this does is name the overlap early.
 */
export function conflicts(storePath, changeIds) {
  const byCapability = new Map();

  for (const id of changeIds) {
    for (const cap of capabilities(storePath, id)) {
      if (!byCapability.has(cap.capability))
        byCapability.set(cap.capability, []);
      byCapability.get(cap.capability).push({ change: id, kinds: cap.kinds });
    }
  }

  return [...byCapability.entries()]
    .filter(([, users]) => users.length > 1)
    .map(([capability, users]) => ({
      capability,
      changes: users,
      // Two ADDEDs of the same capability is a naming clash; a MODIFIED in the mix is
      // the baseline-rewrite problem. Both need PM, for different reasons.
      modifies: users
        .filter((u) => u.kinds.includes("MODIFIED"))
        .map((u) => u.change),
    }));
}

/**
 * Every capability the store knows about, shipped or not, with the changes that touched it.
 *
 * `withText` off by default: the index needs counts and provenance, and sending every
 * spec body to render a list of names is the difference between a page and a payload.
 *
 * `only` narrows the result to one capability. The walk that finds which changes touched
 * what still runs — a capability's history is spread across every change in the store, so
 * there is nowhere smaller to look — but the per-capability work behind it, reading the
 * spec and counting what is in it, is then done once instead of ninety times.
 *
 * Two things this fixes. `openspec/specs/` only contains capabilities that have *shipped*,
 * so a catalogue built from it alone silently omits everything in development — on this store
 * that is two of the three capabilities. And nothing anywhere answers the question you
 * actually have in front of a spec: which change put this here, and what is about to
 * change it. Both directions of that link already exist in the tree; only the index was
 * missing.
 */
export function capabilityCatalog({ withText = false, only = null } = {}) {
  const root = resolveRoot();
  const touched = new Map();

  const add = (cap, entry) => {
    if (!touched.has(cap)) touched.set(cap, []);
    touched.get(cap).push(entry);
  };

  for (const [cap, entries] of deltasInDevelopment(root.path))
    for (const entry of entries) add(cap, entry);

  for (const name of dirs(join(root.path, "openspec", "changes", "archive"))) {
    const date = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    const commit = lastCommit(
      root.path,
      join("openspec", "changes", "archive", name),
    );
    for (const cap of capabilities(root.path, name, true)) {
      add(cap.capability, {
        change: name,
        changeId: date?.[2] ?? name,
        kinds: cap.kinds,
        archived: true,
        // The day it shipped, not the commit that happens to hold it now — the same
        // reading the archive page is ordered by, so a capability's history and the
        // archive cannot date one change two ways.
        at: shippedAt(date?.[1] ?? null, commit),
        archivedOn: shippedOn(date?.[1] ?? null, commit),
      });
    }
  }

  const shipped = specDirs(join(root.path, "openspec", "specs"));
  const all = [...new Set([...shipped, ...touched.keys()])].sort();
  const wanted = only === null ? all : all.filter((cap) => cap === only);

  return wanted.map((cap) => {
    const dir = `openspec/specs/${cap}`;
    const rel = `${dir}/spec.md`;
    const text = shipped.includes(cap)
      ? (read(join(root.path, rel)) ?? "")
      : null;

    // Newest first: what is happening to this capability now matters more than what
    // shipped it. Undated entries sort last rather than pretending to be oldest.
    const history = (touched.get(cap) ?? []).sort(
      (a, b) => (b.at ?? 0) - (a.at ?? 0),
    );

    // Whatever the capability directory holds besides its spec. A capability with no
    // baseline has no directory either, so it has nothing to find.
    const docs = withText
      ? readDocs(root.path, capabilityDocs(join(root.path, dir), dir))
      : null;

    return {
      capability: cap,
      shipped: text !== null,
      state: capabilityState({ shipped: text !== null, history }),
      // Two in-development changes on one capability is the conflict `conflicts()` reports,
      // counted here from the walk already done rather than by walking every change again.
      inDevelopment: history.filter((h) => !h.archived).length,
      path: text === null ? null : rel,
      requirements:
        text === null ? 0 : (text.match(/^###\s+Requirement:/gim) ?? []).length,
      scenarios:
        text === null ? 0 : (text.match(/^####\s+Scenario:/gim) ?? []).length,
      commit: text === null ? null : lastCommit(root.path, rel),
      // Bodies only for the detail view: the index is a list of names and counts, and
      // the text of every capability in the store is a payload rather than a page.
      ...(withText ? { text, docs } : {}),
      history,
    };
  });
}

/**
 * Shipped changes, newest first.
 *
 * The date is the directory's own prefix, which is the day `openspec archive` ran and so
 * the day PM said the change was deployed. Within a day the commits decide, since a
 * prefix is a date and several changes archive on one — and where there is no prefix at
 * all the commit is the whole answer.
 */
export function archive() {
  const root = resolveRoot();
  const base = join(root.path, "openspec", "changes", "archive");

  return dirs(base)
    .map((name) => {
      const date = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
      const dir = `openspec/changes/archive/${name}`;
      const groups = read(join(root.path, dir, "tasks.md")) ?? "";
      const commit = lastCommit(root.path, dir);
      return {
        id: name,
        changeId: date?.[2] ?? name,
        archivedOn: shippedOn(date?.[1] ?? null, commit),
        at: shippedAt(date?.[1] ?? null, commit),
        dir,
        capabilities: capabilities(root.path, name, true).map(
          (c) => c.capability,
        ),
        tasks: (groups.match(/^\s*-\s*\[[xX ]\]/gim) ?? []).length,
        commit,
      };
    })
    .sort(
      (a, b) =>
        b.at - a.at ||
        (b.commit?.at ?? 0) - (a.commit?.at ?? 0) ||
        (a.id < b.id ? 1 : -1),
    );
}

/**
 * One capability, with its baseline text. Null when the store has never heard of it.
 *
 * The ids are checked here rather than in the catalog: this is the only reader that has
 * the documents in hand, and the index draws sixty rows of names and counts that would
 * otherwise each pay for a walk of the store.
 */
export function capability(name) {
  const found = capabilityCatalog({ withText: true, only: name })[0] ?? null;
  if (!found) return null;

  const root = resolveRoot();
  return {
    ...found,
    references: checkReferences(root.path, [
      ...(found.path ? [{ path: found.path, text: found.text }] : []),
      ...(found.docs ?? []).map((doc) => ({ path: doc.path, text: doc.text })),
    ]),
  };
}
