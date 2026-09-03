/**
 * Whether a delta can actually be folded into the baseline it claims to rewrite.
 *
 * `openspec archive` replaces a requirement in the baseline with the one under a
 * `## MODIFIED Requirements` heading, matched by the requirement's own heading line. So a
 * MODIFIED block whose heading does not appear in the baseline word for word does not fail:
 * it lands as something else, or as nothing, and the requirement it was supposed to replace
 * stays as it was. Git has nothing to say about it — the delta and the baseline are
 * different files and both are valid markdown — and it surfaces as behavior that shipped
 * against a requirement nobody updated.
 *
 * The change page has always carried a banner warning about this, on every MODIFIED delta,
 * whether or not anything was wrong with it. That is a warning nobody reads by the second
 * one. This is the same sentence, checked.
 */

/** A requirement heading — the line the fold pairs a delta with a baseline by. */
const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/gim;

/** One requirement name, as the two sides are compared. */
const key = (title) => title.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * The requirements a delta rewrites, and whether the baseline holds each one.
 *
 * Only the block under `## MODIFIED Requirements` — an ADDED requirement is not supposed to
 * be in the baseline, and reading the whole delta would report every one of them as drift.
 * The block ends at the next `##`, which is where the next section of the delta begins.
 *
 * Compared on the requirement's name, with runs of whitespace flattened. What the fold
 * actually matches on is this tool's guess — the CLI's own, and not something to assert
 * from the outside — so the comparison is deliberately the forgiving one: a heading that
 * differs only by a stray double space is the same requirement to everyone reading it, and
 * a banner that cried wolf over one would be exactly as ignorable as the unconditional one
 * it replaces. A name that has actually been reworded is what this is for, and no amount
 * of whitespace flattening hides that.
 */
export function modifiedRequirements(deltaText, baselineText) {
  const block = (
    String(deltaText ?? "").split(
      /^##\s+MODIFIED\s+Requirements[ \t]*$/im,
    )[1] ?? ""
  ).split(/^##\s/m)[0];

  const baseline =
    baselineText === null || baselineText === undefined
      ? null
      : new Set(
          [...String(baselineText).matchAll(REQUIREMENT)].map((m) => key(m[1])),
        );

  return [...block.matchAll(REQUIREMENT)].map((m) => ({
    title: m[1],
    // Null baseline is not "absent": there is no shipped spec at all, which is a different
    // failure and one the reader is told about separately.
    inBaseline: baseline === null ? null : baseline.has(key(m[1])),
  }));
}

/**
 * What is wrong with a delta's MODIFIED block, or null when nothing is.
 *
 * Two failures, and they are not the same conversation. A delta that rewrites a capability
 * with no baseline has nothing to fold into — the change is describing an edit to behavior
 * the store has never shipped, and either the section is wrong or the capability is new. A
 * delta whose headings have drifted has a baseline and will fold into it silently and
 * partially, which is the quieter of the two and the more expensive.
 */
export function modifiedDrift(deltaText, baselineText) {
  const requirements = modifiedRequirements(deltaText, baselineText);
  if (requirements.length === 0) return null;

  if (baselineText === null || baselineText === undefined)
    return {
      reason: "no-baseline",
      requirements: requirements.map((r) => r.title),
    };

  const drifted = requirements.filter((r) => !r.inBaseline).map((r) => r.title);

  return drifted.length > 0 ? { reason: "drift", requirements: drifted } : null;
}
