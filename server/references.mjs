/**
 * Whether the ids this store cites are ids this store defines.
 *
 * The store issues every scenario and every user story a permanent id, and then points at
 * them from everywhere else: a journey's `Accepted by`, a test case's trace, a task naming
 * the scenario it makes pass, a review comment. That is a join table written in prose, and
 * nothing checks either side of it. A cited id that resolves to nothing is a journey
 * accepted by a scenario that does not exist, or a task whose evidence cannot be found, and
 * it reads exactly like one that resolves.
 *
 * The other half is worse and quieter. Ids are permanent by the store's own rules, so a
 * number issued twice does not collide — it silently gives two scenarios one name, and
 * every task, test and review pointing at it now points at whichever one the reader finds
 * first.
 *
 * Both are read off the whole store, once, per request that asks. A citation resolves if
 * anything anywhere defines it: a task legitimately names a scenario in a capability its
 * own change does not touch, and a delta's journeys legitimately name scenarios that are
 * already in the baseline. Narrower scopes were tried against a real store and each one
 * reported as broken references that were simply defined somewhere else.
 */

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { REFERENCE_ID } from "../src/spec.js";
import { read } from "./store.mjs";

/**
 * Where an id is defined: a scenario's heading in a spec, or a user story's in a journeys
 * file. Both forms are the store's own, and both are the line a reader scrolls to.
 */
const DEFINITION = new RegExp(
  String.raw`^(?:####\s+Scenario:\s*(${REFERENCE_ID})\b|###\s+(${REFERENCE_ID})\s*:)`,
  "gim",
);

/**
 * Where one is cited: inside backticks, which is how every reference in the store is
 * written. Bare text is deliberately not matched — an id spelled out in a sentence is
 * prose about the scenario, and a spec's own heading would otherwise cite itself.
 */
const CITATION = new RegExp(String.raw`\`(${REFERENCE_ID})\``, "gi");

/** Every id a document defines, with the line it is defined on. */
export function definitions(text) {
  return matches(text, DEFINITION, (m) => m[1] ?? m[2]);
}

/** Every id a document cites, with the line it is cited on. */
export function citations(text) {
  return matches(text, CITATION, (m) => m[1]);
}

/**
 * Line numbers without a second pass over the text: the offset of each match is counted
 * back to the newlines before it, walking forward through the string once.
 */
function matches(text, pattern, idOf) {
  const body = String(text ?? "");
  const out = [];
  let line = 1;
  let at = 0;

  for (const m of body.matchAll(pattern)) {
    while (at < m.index) {
      if (body[at] === "\n") line++;
      at++;
    }
    out.push({ id: idOf(m), line });
  }
  return out;
}

/** Every markdown file under the store's OpenSpec directory, archive included. */
function markdownFiles(storePath) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = readdirSync(join(storePath, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name.startsWith(".")) continue;
      const path = `${rel}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".md")) out.push(path);
    }
  };
  walk("openspec");
  return out;
}

/**
 * Every id the store defines, and where.
 *
 * The archive is read too, and on purpose: an id defined only by a shipped change is still
 * a real id, and a task that names one is pointing at something a reader can go and find.
 * What it is *not* is a duplicate — the same scenario appears in the change that introduced
 * it, in the baseline it folded into, and in any change rewriting it, which is one
 * scenario written down three times rather than three scenarios sharing a name. So
 * duplicates are only ever counted within one document.
 */
export function storeIds(storePath) {
  const defined = new Map();

  for (const path of markdownFiles(storePath)) {
    const text = read(join(storePath, path));
    if (!text) continue;
    for (const { id, line } of definitions(text)) {
      const key = id.toLowerCase();
      if (!defined.has(key)) defined.set(key, []);
      defined.get(key).push({ path, line, id });
    }
  }

  return defined;
}

/**
 * The ids a set of documents cites that nothing in the store defines, and the ids any of
 * them defines twice.
 *
 * `documents` is `[{ path, text }]` — whatever the page in hand is showing, so the answer
 * is about the change or the capability being read rather than about the store at large.
 */
export function checkReferences(storePath, documents) {
  const defined = storeIds(storePath);
  const unresolved = [];
  const duplicates = [];

  for (const { path, text } of documents) {
    if (!text) continue;

    for (const { id, line } of citations(text)) {
      if (defined.has(id.toLowerCase())) continue;
      unresolved.push({ path, id, line, meant: nearest(defined, id) });
    }

    const here = new Map();
    for (const { id, line } of definitions(text)) {
      const key = id.toLowerCase();
      if (!here.has(key)) here.set(key, { id, lines: [] });
      here.get(key).lines.push(line);
    }
    for (const entry of here.values()) {
      if (entry.lines.length > 1) duplicates.push({ path, ...entry });
    }
  }

  return { unresolved, duplicates };
}

/**
 * The id somebody probably meant, or null.
 *
 * A capability's prefix is chosen once and never moves, so it is long — and the id written
 * from memory in a task list is the tail of it. An unresolved citation is far more often a
 * prefix dropped than a scenario that does not exist, and "no such scenario" is unhelpful
 * next to a store that plainly has one.
 *
 * Only ever one. Two capabilities can end their prefixes the same way, and guessing
 * between them would put a reader onto the wrong scenario with more confidence than the
 * bare id gave them.
 */
function nearest(defined, id) {
  const tail = `-${id.toLowerCase()}`;
  const found = [...defined.keys()].filter((key) => key.endsWith(tail));
  return found.length === 1 ? defined.get(found[0])[0].id : null;
}
