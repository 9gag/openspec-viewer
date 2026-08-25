/**
 * The cross-change view: the shipped baseline, the archive, and the one thing nobody
 * can currently see coming — two in-flight changes deltaing the same capability.
 */

import { join } from "node:path";

import { capabilities } from "./change.mjs";
import {
  changeIds,
  dirs,
  lastCommit,
  read,
  resolveRoot,
  specDirs,
} from "./store.mjs";

/**
 * When a shipped change actually shipped, as YYYY-MM-DD.
 *
 * The archive directory's date prefix is assigned by whoever ran `openspec archive`, and
 * on a change whose folder was created days before it shipped it names the wrong day.
 * The commit that moved the folder into the archive is the real one, so it wins; the
 * prefix is the fallback for a store whose archive predates its git history.
 */
function shippedOn(commit, prefix) {
  if (!commit) return prefix;
  const d = new Date(commit.at);
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

/**
 * Capabilities two or more in-flight changes both touch.
 *
 * This is the archive-time hazard, and it never shows up as a git conflict: each change
 * is its own folder, so both push cleanly. It breaks later, when the second change
 * archives against a baseline the first one already rewrote — and a MODIFIED block
 * whose headers no longer match the baseline silently drops the rest of the
 * requirement. By then the plan and the specs disagree and nothing said so.
 *
 * Sequencing them is a planning decision, so all this does is name the overlap early.
 */
export function collisions(storePath, changeIds) {
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
 * Two things this fixes. `openspec/specs/` only contains capabilities that have *shipped*,
 * so a catalogue built from it alone silently omits everything in flight — on this store
 * that is two of the three capabilities. And nothing anywhere answers the question you
 * actually have in front of a spec: which change put this here, and what is about to
 * change it. Both directions of that link already exist in the tree; only the index was
 * missing.
 */
export function capabilityCatalog({ withText = false } = {}) {
  const root = resolveRoot();
  const touched = new Map();

  const add = (cap, entry) => {
    if (!touched.has(cap)) touched.set(cap, []);
    touched.get(cap).push(entry);
  };

  for (const id of changeIds(root.path)) {
    const at =
      lastCommit(root.path, join("openspec", "changes", id))?.at ?? null;
    for (const cap of capabilities(root.path, id)) {
      add(cap.capability, {
        change: id,
        changeId: id,
        kinds: cap.kinds,
        archived: false,
        at,
        archivedOn: null,
      });
    }
  }

  for (const name of dirs(join(root.path, "openspec", "changes", "archive"))) {
    const date = name.match(/^(\d{4}-\d{2}-\d{2})-(.+)$/);
    const at =
      lastCommit(root.path, join("openspec", "changes", "archive", name))?.at ??
      null;
    for (const cap of capabilities(root.path, name, true)) {
      add(cap.capability, {
        change: name,
        changeId: date?.[2] ?? name,
        kinds: cap.kinds,
        archived: true,
        at,
        archivedOn: shippedOn(at === null ? null : { at }, date?.[1] ?? null),
      });
    }
  }

  const shipped = specDirs(join(root.path, "openspec", "specs"));
  const all = [...new Set([...shipped, ...touched.keys()])].sort();

  return all.map((cap) => {
    const rel = `openspec/specs/${cap}/spec.md`;
    const text = shipped.includes(cap)
      ? (read(join(root.path, rel)) ?? "")
      : null;

    return {
      capability: cap,
      shipped: text !== null,
      path: text === null ? null : rel,
      requirements:
        text === null ? 0 : (text.match(/^###\s+Requirement:/gim) ?? []).length,
      scenarios:
        text === null ? 0 : (text.match(/^####\s+Scenario:/gim) ?? []).length,
      commit: text === null ? null : lastCommit(root.path, rel),
      ...(withText ? { text } : {}),
      // Newest first: what is happening to this capability now matters more than what
      // shipped it. Undated entries sort last rather than pretending to be oldest.
      history: (touched.get(cap) ?? []).sort(
        (a, b) => (b.at ?? 0) - (a.at ?? 0),
      ),
    };
  });
}

/**
 * Shipped changes, newest first.
 *
 * Not directory order: archive directories are named `<date>-<change-id>`, so listing
 * them sorts a day's changes by name rather than by when they shipped, and a folder
 * whose prefix was set days before it archived sorts under the wrong day entirely. The
 * commit that moved the folder into the archive is what "shipped" means here, so both
 * the order and the date shown come from it, with the name's prefix as the fallback.
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
        archivedOn: shippedOn(commit, date?.[1] ?? null),
        // Undated and uncommitted sorts last rather than pretending to be oldest-known.
        at: commit?.at ?? (date ? Date.parse(date[1]) : 0),
        dir,
        capabilities: capabilities(root.path, name, true).map(
          (c) => c.capability,
        ),
        tasks: (groups.match(/^\s*-\s*\[[xX ]\]/gim) ?? []).length,
        commit,
      };
    })
    .sort((a, b) => b.at - a.at || (a.id < b.id ? 1 : -1));
}

/** One capability, with its baseline text. Null when the store has never heard of it. */
export function capability(name) {
  return (
    capabilityCatalog({ withText: true }).find((c) => c.capability === name) ??
    null
  );
}
