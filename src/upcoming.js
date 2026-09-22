/**
 * What Upcoming reads like for whichever in-development changes a reader currently has
 * enabled.
 *
 * `/api/spec`'s `upcoming.requirements` carries every touch, from every in-development
 * change, on every requirement heading — the raw material, not a rendering. This is the
 * seam the chip row runs through: disabling a chip is a checkbox click, and turning it back
 * into a reading has to stay instant, so the fold happens here instead of a round trip back
 * to the server for something it already sent once.
 */

/**
 * One requirement, folded to the subset of changes currently enabled.
 *
 * `durable` — nothing enabled touches it; the baseline stands as it is.
 * `single` — exactly one enabled touch; it replaces (MODIFIED), extends (ADDED), or
 * strikes through (REMOVED) the baseline reading.
 * `disagreement` — two or more enabled touches on the same heading, shown side by side
 * rather than resolved into one. Not called a **conflict**: that word already names two
 * changes deltaing the same *capability* (see `conflicts()` in `server/catalog.mjs`), a
 * coarser fact the board and catalog already show. This is finer-grained — the same
 * *requirement* — and calling it by the same name would blur a distinction a reader of
 * both pages needs to keep.
 *
 * A requirement with no baseline and no enabled touch is left out entirely: it only ever
 * existed because an ADDED delta introduced it, and disabling that change is disabling the
 * only reason it is here.
 */
export function resolveUpcoming(requirements, enabledChangeIds) {
  const enabled = new Set(enabledChangeIds);
  const readings = [];

  for (const entry of requirements ?? []) {
    const touches = entry.touches.filter((t) => enabled.has(t.changeId));

    if (touches.length === 0) {
      if (entry.baselineText === null) continue;
      readings.push({
        kind: "durable",
        heading: entry.heading,
        text: entry.baselineText,
      });
      continue;
    }

    if (touches.length === 1) {
      readings.push({
        kind: "single",
        heading: entry.heading,
        baselineText: entry.baselineText,
        changeId: touches[0].changeId,
        operation: touches[0].operation,
        text: touches[0].text,
      });
      continue;
    }

    readings.push({
      kind: "disagreement",
      heading: entry.heading,
      baselineText: entry.baselineText,
      touches,
    });
  }

  return readings;
}

/** Every change id `upcoming.requirements` mentions, in first-appearance order. */
export function changesTouching(requirements) {
  const seen = new Set();
  for (const entry of requirements ?? [])
    for (const touch of entry.touches) seen.add(touch.changeId);
  return [...seen];
}
