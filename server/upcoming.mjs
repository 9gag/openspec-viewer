/**
 * What a capability reads like once every in-development change deltaing it has landed.
 *
 * `openspec archive` folds one change into the baseline at a time, matching a MODIFIED or
 * REMOVED block to a baseline requirement by its `### Requirement:` heading (see `key()` in
 * `deltas.mjs`). This does the same match, but for every in-development change on a
 * capability at once and against each other, not one delta against the baseline — there is
 * no real order for them to land in yet, so none is invented by folding one change's result
 * into the next.
 */

import { key } from "./deltas.mjs";

/** A delta's own operation sections — RENAMED is not modelled here, see design.md. */
const OPERATION = /^##\s+(ADDED|MODIFIED|REMOVED)\s+Requirements[ \t]*$/gim;
const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/gim;

/** Every `heading: text` block between one match of `pattern` and the next, or the end. */
function blocksOf(text, pattern) {
  const matches = [...String(text ?? "").matchAll(pattern)];
  return matches.map((m, i) => ({
    name: m[1],
    text: text.slice(m.index, matches[i + 1]?.index ?? text.length).trim(),
  }));
}

/**
 * A delta's requirements, tagged with the operation each sits under.
 *
 * Only requirements inside an ADDED/MODIFIED/REMOVED section count — the same restriction
 * `modifiedRequirements` already applies to MODIFIED, generalized to the other two.
 */
export function deltaRequirements(deltaText) {
  return blocksOf(deltaText, OPERATION).flatMap(({ name, text: section }) =>
    blocksOf(section, REQUIREMENT).map((r) => ({
      operation: name.toUpperCase(),
      heading: r.name,
      text: r.text,
    })),
  );
}

/** A baseline's requirements, each with its own full text. Empty for no baseline at all. */
export function baselineRequirements(baselineText) {
  if (baselineText === null || baselineText === undefined) return [];
  return blocksOf(baselineText, REQUIREMENT).map((r) => ({
    heading: r.name,
    text: r.text,
  }));
}

/**
 * One entry per requirement heading the baseline holds or an in-development delta ADDs,
 * carrying the baseline's own text (`null` when there is none) and every delta's touch on
 * it. A heading with more than one touch is a disagreement — this does not decide that; it
 * is for whichever subset of changes the reader currently has enabled to decide, so the
 * same data serves every subset without asking the server again. Not a **conflict**: that
 * word already names the capability-level fact `conflicts()` reports in `catalog.mjs`; this
 * is the finer-grained, per-requirement version of it.
 *
 * Only ADDED can introduce a heading the baseline never had. A MODIFIED or REMOVED block
 * naming a heading nothing before it in this list already holds — no baseline requirement,
 * and no earlier ADDED delta — cannot fold into anything and is left out; that is the same
 * "no baseline to fold into" failure `modifiedDrift` already reports for one delta, surfaced
 * at the capability level rather than invented twice.
 */
export function composeUpcoming(baselineText, deltas) {
  const entries = new Map();
  const order = [];

  for (const req of baselineRequirements(baselineText)) {
    const k = key(req.heading);
    entries.set(k, { heading: req.heading, baselineText: req.text, touches: [] });
    order.push(k);
  }

  for (const { changeId, text } of deltas) {
    for (const d of deltaRequirements(text)) {
      const k = key(d.heading);
      if (!entries.has(k)) {
        if (d.operation !== "ADDED") continue;
        entries.set(k, { heading: d.heading, baselineText: null, touches: [] });
        order.push(k);
      }
      entries.get(k).touches.push({
        changeId,
        operation: d.operation,
        text: d.text,
      });
    }
  }

  return order.map((k) => entries.get(k));
}
