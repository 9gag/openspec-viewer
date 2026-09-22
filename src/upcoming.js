/**
 * What a capability's own artifacts read like once whichever in-development changes a
 * reader currently has enabled have landed — spec.md and any document filed beside it, a
 * journey or a set of test cases.
 *
 * `/api/spec`'s `upcoming` carries every touch, from every in-development change, on every
 * requirement heading and every document — the raw material, not a rendering. This is the
 * seam the chip row runs through: disabling a chip is a checkbox click, and turning it back
 * into a reading has to stay instant, so the fold happens here instead of a round trip back
 * to the server for something it already sent once.
 *
 * spec.md's result is spliced into the baseline's own document rather than pulled out into
 * a separate list, so Upcoming reads exactly like Durable — same headings, same order, same
 * Purpose section — with only the touched requirements marked and, where more than one
 * change touches the same one, both versions shown in place rather than one chosen for you.
 * A document beside spec.md has no such paragraph to fold — nothing marks one of its
 * sentences ADDED or another REMOVED — so every version present, shipped or not, is shown
 * in full instead.
 */

/** A requirement heading — the line a spliced block is found and rejoined by. */
const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/gim;

/** A plain blockquote line, so it renders through the same Markdown every requirement does. */
const marker = (label, changeId) => `> **${label}** · via \`${changeId}\``;

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
 * spec.md's document, as it would read with every enabled in-development change on it
 * folded in — same requirement order the baseline holds, an ADDED-only requirement appended
 * after it, and nothing at all when a capability with no baseline has every touching change
 * disabled.
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

/**
 * Which of ADDED/MODIFIED/REMOVED a requirement is, for the subset of changes currently
 * enabled — or `"disagreement"` where more than one of them touches it, and nothing at all
 * for a requirement none of them touches. Keyed by the requirement's own heading, trimmed,
 * the same key `buildUpcomingText` splices its composite text back together by, so a
 * heading found in the rendered document and a heading found here name the same requirement.
 *
 * Split out of `buildUpcomingText` rather than folded into its return value: the text is
 * markdown handed to a renderer that knows nothing about deltas, and this is the one part of
 * the fold a renderer *does* need to know, to tint a requirement's own section by what
 * happened to it without re-parsing the text it was just given.
 */
export function upcomingKinds(requirements, enabledChangeIds) {
  const enabled = new Set(enabledChangeIds);
  const kinds = new Map();
  for (const entry of requirements ?? []) {
    const touches = entry.touches.filter((t) => enabled.has(t.changeId));
    if (touches.length === 0) continue;
    kinds.set(
      entry.heading.trim(),
      touches.length > 1 ? "disagreement" : touches[0].operation.toLowerCase(),
    );
  }
  return kinds;
}

/**
 * A document filed beside spec.md — a journey, a set of test cases — as the versions
 * currently worth showing: the shipped one, and every enabled change's own copy. There is
 * no paragraph here to fold the way a requirement's is — a change carries its own whole copy
 * of the file, or none at all — so this is a list to render one block per version, tinted by
 * `kind`, rather than one string the way spec.md's composite is.
 */
export function upcomingDocVersions(durableText, versions, enabledChangeIds) {
  const enabled = new Set(enabledChangeIds);
  const touches = (versions ?? []).filter((v) => enabled.has(v.changeId));

  if (touches.length === 0)
    return durableText ? [{ kind: "shipped", text: durableText }] : [];

  const kind = touches.length > 1 ? "disagreement" : "pending";
  const out = [];
  if (durableText) out.push({ kind: "shipped", text: durableText });
  for (const touch of touches)
    out.push({ kind, changeId: touch.changeId, text: touch.text });
  return out;
}

/**
 * Every change id `upcoming` mentions, from spec.md's own requirements or any document
 * beside it, in first-appearance order — the chip row's own list, shared across every tab
 * a capability has rather than rebuilt per one.
 */
export function changesTouching(upcoming) {
  const seen = new Set();
  for (const entry of upcoming?.requirements ?? [])
    for (const touch of entry.touches) seen.add(touch.changeId);
  for (const doc of upcoming?.docs ?? [])
    for (const version of doc.versions) seen.add(version.changeId);
  return [...seen];
}

/**
 * Durable and Upcoming are a reading, the same kind of thing `?mode=` and `?board=` already
 * are — not a position, so it belongs in the query rather than the fragment, and it is
 * meant to be shared: a link opens straight on the reading it names. Unlike those two,
 * though, the toggle rewrites the address bar the moment it is clicked rather than only
 * ever being read on load — `SpecDetail` is the one reading in this store worth linking to
 * exactly, since which changes are enabled lives in memory and cannot travel any other way.
 */
export const VERSION_KEY = "version";

/** Durable unless the query says otherwise — `?version=upcoming` for a link written to
 * open straight on it. Anything else, including nothing at all, is Durable: an address
 * with no opinion about the reading means the one every capability opens on. */
export function versionFromUrl(search = "") {
  return new URLSearchParams(search).get(VERSION_KEY) === "upcoming"
    ? "upcoming"
    : "durable";
}

/**
 * The address a switch to `version` writes into the bar — every other query parameter
 * kept, `version` dropped entirely for Durable rather than written out as
 * `?version=durable`. An address with the parameter absent already means Durable, so
 * writing it anyway would make two spellings of the same link.
 */
export function withVersion({ pathname = "", search = "", hash = "" } = {}, version) {
  const params = new URLSearchParams(search);
  if (version === "upcoming") params.set(VERSION_KEY, "upcoming");
  else params.delete(VERSION_KEY);
  const query = params.toString();
  return `${pathname}${query ? `?${query}` : ""}${hash}`;
}
