/**
 * A spec, as the parts a reader asks for one at a time.
 *
 * The store's specs are long by design — the biggest is nineteen requirements over
 * sixty-four scenarios, and four fifths of the page is Given/When/Then. That is the right
 * amount of detail for the person checking it and far too much for the person asking what
 * this capability is held to, and they are usually not the same person.
 *
 * So the document is parsed into what it already is: prose, then requirements, each with
 * its own scenarios. Nothing is rewritten — every part still renders through the same
 * markdown path as before — but the parts can be shown and hidden independently.
 */

import { positionIn, SCENARIO_KEY } from "./toc.js";

const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO = /^####\s+Scenario:\s*(.+?)\s*$/;
/** A heading at or above a requirement's own level ends it. */
const ENCLOSING = /^#{1,3}\s/;

/**
 * The shape of a scenario id, as the store issues them: `loyalty-SC-07`.
 *
 * A source string rather than a regex, because the two places that have to agree about it
 * wrap it differently — the heading that defines a scenario anchors the whole line, the
 * reference that names one sits inside backticks in a list item. Sharing the shape is what
 * stops a reference resolving against nothing for a reason nobody can see.
 */
const ISSUED = String.raw`[a-z0-9][\w-]*`;

/**
 * The number, and the letter a store is forced into by its own rules.
 *
 * Ids are permanent and never renumbered, so a scenario that belongs between 07 and 08 is
 * issued as `07a` — there is nowhere else for it to go. Reading the number alone stops at
 * the digits, which does not match the heading it came from, so those scenarios lost their
 * id: rendered with it still inside the title, anchored on a slug of the whole line, and
 * invisible to anything resolving a reference to them.
 */
const NUMBER = String.raw`\d+[a-z]?`;

export const SCENARIO_ID = String.raw`${ISSUED}-SC-${NUMBER}`;

/**
 * The shape of any id the store issues, scenario or user story: `loyalty-SC-07`,
 * `admin-listing-US-01`.
 *
 * Both are permanent, both are cited as bare ids by tasks, reviews and test cases, and a
 * reader who has one in hand wants the same thing either way — the place it is defined.
 * Only scenarios resolve *inside* a document, which is why the narrower shape above is the
 * one the reference renderer uses; this is for whoever is holding an id and looking for it.
 */
export const REFERENCE_ID = String.raw`${ISSUED}-(?:SC|US)-${NUMBER}`;

/**
 * A scenario's id and title, from the heading the store writes them in:
 * `#### Scenario: loyalty-SC-07 - Rounding happens once`.
 *
 * The id is what a task, a review comment or a test case names, and it is permanent by the
 * store's own rules — which is exactly what makes it worth linking to. A scenario written
 * without one is not an error here: it keeps its whole heading as its title and gets an
 * anchor from that instead.
 */
export function scenarioName(heading) {
  const named = heading.match(
    new RegExp(String.raw`^(${SCENARIO_ID})\s*[-–—]\s*(.+)$`, "i"),
  );
  return named
    ? { id: named[1], title: named[2].trim() }
    : { id: null, title: heading };
}

/**
 * The spec as an ordered list of nodes: `prose` for everything that is not a requirement,
 * and `requirement` for one, carrying its own prose and its scenarios.
 *
 * Prose keeps its line breaks and is handed to the markdown renderer whole, so tables,
 * lists and code fences are never cut in half by this — the split is only ever at a
 * heading the store defines.
 */
export function parseSpec(text) {
  const nodes = [];
  let prose = [];
  let requirement = null;
  let scenario = null;

  const flushProse = () => {
    if (prose.join("").trim())
      nodes.push({ kind: "prose", text: prose.join("\n") });
    prose = [];
  };

  const closeScenario = () => {
    if (!scenario) return;
    requirement.scenarios.push({ ...scenario, text: scenario.text.join("\n") });
    scenario = null;
  };

  const closeRequirement = () => {
    closeScenario();
    if (!requirement) return;
    nodes.push({ ...requirement, text: requirement.text.join("\n") });
    requirement = null;
  };

  for (const line of String(text ?? "").split("\n")) {
    const isRequirement = line.match(REQUIREMENT);
    if (isRequirement) {
      flushProse();
      closeRequirement();
      requirement = {
        kind: "requirement",
        title: isRequirement[1],
        text: [],
        scenarios: [],
      };
      continue;
    }

    if (requirement) {
      const isScenario = line.match(SCENARIO);
      if (isScenario) {
        closeScenario();
        scenario = { ...scenarioName(isScenario[1]), text: [] };
        continue;
      }
      // A group heading, or the next section: the requirement is over, and the heading
      // itself belongs to the prose that follows it.
      if (ENCLOSING.test(line)) {
        closeRequirement();
        prose.push(line);
        continue;
      }
      (scenario ?? requirement).text.push(line);
      continue;
    }

    prose.push(line);
  }

  closeRequirement();
  flushProse();
  return nodes;
}

/** How many scenarios a parsed spec holds, which is what decides whether it needs hiding. */
export const scenarioCount = (nodes) =>
  nodes.reduce((n, node) => n + (node.scenarios?.length ?? 0), 0);

/**
 * The three ways this page is read, and what each one leaves on it.
 *
 * Not a density control: the parts are for different people. `contract` is the reader
 * asking what this capability is held to — the requirements and the prose that qualifies
 * them, with the checking hidden. `scenarios` is whoever is working through the checks, so
 * the narrative that introduces them comes off and the checkable material is all that is
 * left. `full` is the document as written.
 *
 * Ordered by how much of the document each one leaves, so the control reads as a scale
 * from the shortest reading to the whole file rather than as three unrelated choices, and
 * `full` sits at the end where "everything" belongs. They are named for what is on the
 * page, not for who came for it: `scenarios` is the part of the spec it shows, where "test
 * plan" was a job title for a reader — and the wrong one for the engineer reading the
 * same scenarios to build from, or the author checking the ids a journey accepts.
 */
export const LENSES = [
  { value: "contract", label: "Contract", scenarios: false, prose: true },
  { value: "scenarios", label: "Scenarios", scenarios: true, prose: false },
  { value: "full", label: "Full", scenarios: true, prose: true },
];

export const DEFAULT_LENS = "contract";

export const lensRules = (value) =>
  LENSES.find((l) => l.value === value) ??
  LENSES.find((l) => l.value === DEFAULT_LENS);

// Remembered per browser, like the appearance and the nav's names: which of the three you
// want is a property of the job you are doing today, not of the spec.
const KEY = "openspec-viewer.lens";

export function loadLens() {
  try {
    const saved = window.localStorage?.getItem(KEY);
    return LENSES.some((l) => l.value === saved) ? saved : DEFAULT_LENS;
  } catch {
    return DEFAULT_LENS;
  }
}

export function saveLens(value) {
  try {
    window.localStorage?.setItem(KEY, value);
  } catch {
    // Private browsing: the choice just does not persist.
  }
}

/**
 * The scenario a link asked for, if any.
 *
 * `#/spec/<capability>?at=loyalty-SC-07` — the position rides inside the fragment, after
 * the route, so that the two move together and a scenario id cannot outlive the spec it
 * belongs to. Read on the way in, and only then: which scenario a reader was pointed at is
 * a fact about how they arrived, not a thing the page goes on tracking.
 */
export function linkedScenario(hash = window.location?.hash ?? "") {
  return positionIn(hash)[SCENARIO_KEY];
}

/**
 * Every scenario in a parsed spec, by the id a reference would name it with.
 *
 * A journey lists the scenarios that accept it as bare ids, and so does a task, a review
 * and a test case. On the page that list is a join table printed as a document: the reader
 * either takes twenty-four ids on trust or scrolls to each one. This is the other half of
 * the join, so the renderer can put the scenario where the reference is.
 *
 * First definition wins. A store that issued one id twice has a problem this cannot fix
 * and should not paper over by picking the later one — the reference resolves to the
 * scenario a reader scrolling for it would reach first.
 */
export function scenarioIndex(nodes, prefix = "") {
  const index = new Map();

  for (const node of nodes)
    for (const scenario of node.scenarios ?? []) {
      const key = scenario.id?.toLowerCase();
      if (!key || index.has(key)) continue;
      index.set(key, {
        ...scenario,
        requirement: node.title,
        anchor: scenarioAnchor(scenario, prefix),
      });
    }

  return index;
}

/** Where a scenario sits on the page: its own id when it has one, else its title. */
export const scenarioAnchor = (scenario, prefix = "") =>
  (scenario.id ?? `${prefix}-${scenario.title}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
