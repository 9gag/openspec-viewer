/**
 * Types for `@seankcw/openspec-viewer/lib/spec`.
 *
 * Hand-written for the reason `store.d.mts` gives, and checked the same way: every
 * export is called from `test/lib.test.mjs` against the shapes below.
 */

/** A step's role in a scenario, which is what decides how it is coloured. */
export type StepKind = "trigger" | "outcome" | "conjunction";

/** One WHEN / THEN / AND line of a scenario. */
export type Step = {
  /** The keyword as matched, upper-cased. */
  keyword: string;
  kind: StepKind;
  /** The rest of the line, trimmed. */
  text: string;
};

/** A list item that is nothing but a pointer at a scenario defined elsewhere — how
 * the store writes a journey's "Accepted by" and a test case's "Covers". */
export type ScenarioRef = {
  id: string;
  /** The title the reference repeats, or `""` where it carries none. */
  title: string;
};

/** What `splitSpec` returns: the document as runs of one shape at a time. */
export type SpecBlock =
  | { type: "markdown"; text: string }
  | { type: "steps"; steps: Step[] }
  | { type: "refs"; refs: ScenarioRef[] };

/** One scenario of a requirement. */
export type ParsedScenario = {
  /** The permanent store id, e.g. `checkout-SC-07`. Null when the heading has none. */
  id: string | null;
  title: string;
  /** The scenario's body, verbatim, line breaks kept. */
  text: string;
};

/** A spec as `parseSpec` reads it: prose, and requirements carrying their scenarios. */
export type SpecNode =
  | { kind: "prose"; text: string }
  | {
      kind: "requirement";
      /** The heading text after `### Requirement:`. */
      title: string;
      text: string;
      scenarios: ParsedScenario[];
    };

/** A scenario as the index holds it, with where it was defined and where it renders. */
export type IndexedScenario = ParsedScenario & {
  /** The title of the requirement that defines it. */
  requirement: string;
  anchor: string;
};

/** Prose split around its obligation words. `kind` is null for ordinary text. */
export type EmphasisPart = {
  text: string;
  kind: "obligation" | null;
};

/**
 * A spec as an ordered list of nodes.
 *
 * Prose keeps its line breaks and is returned whole, so a table, list or code fence is
 * never cut in half — the split is only ever at a heading the store defines.
 */
export function parseSpec(text: string): SpecNode[];

/**
 * The id and title inside a scenario heading: `checkout-SC-07 - Rounding happens once`.
 *
 * A scenario written without an id is not an error — it keeps its whole heading as its
 * title, and `id` is null.
 */
export function scenarioName(heading: string): {
  id: string | null;
  title: string;
};

/**
 * Every scenario in a parsed spec, keyed by its lowercased id.
 *
 * The other half of the join a journey prints as a list of bare ids. Scenarios with no
 * id are left out — there is nothing to resolve against. First definition wins: a store
 * that issued one id twice has a problem this cannot fix, and picking the later one
 * would resolve to a scenario further down the page than the reader would reach.
 */
export function scenarioIndex(
  nodes: SpecNode[],
  prefix?: string,
): Map<string, IndexedScenario>;

/** Where a scenario sits on a page: its permanent id, else its prefixed title. */
export function scenarioAnchor(
  scenario: { id?: string | null; title: string },
  prefix?: string,
): string;

/**
 * The shape of a permanent scenario id, as a regex source string rather than a regex.
 *
 * The two places that have to agree about it wrap it differently — a heading anchors
 * the whole line, a reference sits inside backticks in a list item — so the shape is
 * shared and the anchoring is not.
 */
export const SCENARIO_ID: string;

/**
 * A spec split into runs of scenario steps, runs of scenario references, and the
 * markdown between them.
 *
 * Every line in is a line out. Markdown is only ever split at a step or reference
 * boundary, and both are whole list items, so the prose around them stays intact for a
 * markdown renderer to handle.
 */
export function splitSpec(text: string): SpecBlock[];

/**
 * Prose split around its obligation words — MUST, SHALL, SHOULD and their NOT forms.
 *
 * Returns parts rather than markup, so the caller decides how to render them. A string
 * with no obligation in it comes back as one part with a null kind.
 */
export function emphasize(text: string): EmphasisPart[];

/** A step keyword's role, or null for a word that is not one. Case-insensitive. */
export function stepKind(word: string): StepKind | null;

/** Every step keyword `splitSpec` recognises, upper-cased. */
export const STEP_KEYWORDS: string[];
