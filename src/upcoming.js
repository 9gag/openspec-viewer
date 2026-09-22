/**
 * What a capability's whole document reads like once whichever in-development changes a
 * reader currently has enabled have landed.
 *
 * `/api/spec`'s `upcoming.requirements` carries every touch, from every in-development
 * change, on every requirement heading — the raw material, not a rendering. This is the
 * seam the chip row runs through: disabling a chip is a checkbox click, and turning it back
 * into a reading has to stay instant, so the fold happens here instead of a round trip back
 * to the server for something it already sent once.
 *
 * The result is spliced into the baseline's own document rather than pulled out into a
 * separate list, so Upcoming reads exactly like Durable — same headings, same order, same
 * Purpose section — with only the touched requirements marked and, where more than one
 * change touches the same one, both versions shown in place rather than one chosen for you.
 */

/** A requirement heading — the line a spliced block is found and rejoined by. */
const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/gim;

const OPERATION_LABEL = { ADDED: "ADDED", MODIFIED: "MODIFIED", REMOVED: "REMOVED" };

/** A plain blockquote line, so it renders through the same Markdown every requirement does. */
const marker = (operation, changeId) =>
  `> **${OPERATION_LABEL[operation]}** · via \`${changeId}\``;

/** A delta's own requirement text, with its `### Requirement:` line dropped — the heading
 * spliced text sits under is already on the page, in the baseline's own spelling. */
const withoutHeading = (text) =>
  text.replace(/^###\s+Requirement:.*(\r?\n)?/, "").trim();

/**
 * Everything before the first requirement heading, and each requirement's own full block —
 * heading, prose and scenarios together, exactly as `### Requirement:` to the next one (or
 * the end of the document) bounds it.
 */
function blocksOf(text) {
  const source = String(text ?? "");
  const matches = [...source.matchAll(REQUIREMENT)];
  return {
    before: matches.length ? source.slice(0, matches[0].index) : source,
    blocks: matches.map((m, i) => ({
      heading: m[1],
      text: source.slice(m.index, matches[i + 1]?.index ?? source.length).trimEnd(),
    })),
  };
}

/**
 * One requirement's text, folded to the touches currently enabled — `null` when there is
 * nothing left to show it (it only ever existed because a now-disabled change ADDed it).
 */
function foldEntry(entry, enabled) {
  const touches = entry.touches.filter((t) => enabled.has(t.changeId));

  if (touches.length === 0) return entry.baselineText;

  if (touches.length === 1) {
    const [touch] = touches;

    if (touch.operation === "REMOVED") {
      // The requirement being removed stays visible — struck through is not something a
      // block of prose and scenarios can do in Markdown, so it is named instead, with
      // whatever Reason/Migration the REMOVED block itself carries.
      return [entry.baselineText, marker("REMOVED", touch.changeId), withoutHeading(touch.text)]
        .filter(Boolean)
        .join("\n\n");
    }

    const heading =
      entry.baselineText === null ? "" : `### Requirement: ${entry.heading}\n\n`;
    const body = entry.baselineText === null ? touch.text : withoutHeading(touch.text);
    return `${heading}${marker(touch.operation, touch.changeId)}\n\n${body}`;
  }

  // Two or more enabled changes touch this heading: never resolved into one reading.
  const head =
    entry.baselineText !== null
      ? `### Requirement: ${entry.heading}\n\n> ⚠ **${touches.length} changes disagree here** — shown separately, not merged\n\n${withoutHeading(entry.baselineText)}`
      : `### Requirement: ${entry.heading}\n\n> ⚠ **${touches.length} changes disagree here** — shown separately, not merged`;

  const versions = touches
    .map((touch) => `${marker(touch.operation, touch.changeId)}\n\n${withoutHeading(touch.text)}`)
    .join("\n\n---\n\n");

  return `${head}\n\n---\n\n${versions}`;
}

/**
 * The capability's document, as it would read with every enabled in-development change on
 * it folded in — same requirement order the baseline holds, an ADDED-only requirement
 * appended after it, and nothing at all when a capability with no baseline has every
 * touching change disabled.
 */
export function buildUpcomingText(baselineText, requirements, enabledChangeIds) {
  const enabled = new Set(enabledChangeIds);
  const folded = new Map();
  for (const entry of requirements ?? []) {
    const text = foldEntry(entry, enabled);
    if (text) folded.set(entry.heading.trim(), text);
  }

  if (baselineText === null || baselineText === undefined)
    return [...folded.values()].join("\n\n");

  const { before, blocks } = blocksOf(baselineText);
  const seen = new Set();
  const spliced = blocks
    .map((b) => {
      seen.add(b.heading.trim());
      return folded.get(b.heading.trim()) ?? null;
    })
    .filter(Boolean);
  const appended = [...folded.entries()]
    .filter(([heading]) => !seen.has(heading))
    .map(([, text]) => text);

  return [before.trimEnd(), ...spliced, ...appended].filter(Boolean).join("\n\n");
}

/** Every change id `upcoming.requirements` mentions, in first-appearance order. */
export function changesTouching(requirements) {
  const seen = new Set();
  for (const entry of requirements ?? [])
    for (const touch of entry.touches) seen.add(touch.changeId);
  return [...seen];
}

/** How many requirements two or more of the enabled changes disagree on right now. */
export function disagreementCount(requirements, enabledChangeIds) {
  const enabled = new Set(enabledChangeIds);
  return (requirements ?? []).filter(
    (entry) => entry.touches.filter((t) => enabled.has(t.changeId)).length >= 2,
  ).length;
}
