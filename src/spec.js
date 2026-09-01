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

const REQUIREMENT = /^###\s+Requirement:\s*(.+?)\s*$/;
const SCENARIO = /^####\s+Scenario:\s*(.+?)\s*$/;
/** A heading at or above a requirement's own level ends it. */
const ENCLOSING = /^#{1,3}\s/;

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
  const named = heading.match(/^([a-z0-9][\w-]*-SC-\d+)\s*[-–—]\s*(.+)$/i);
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
 * them, with the checking hidden. `full` is the document as written. `test` is whoever is
 * working through the scenarios, so the narrative that introduces them comes off and the
 * checkable material is all that is left.
 */
export const LENSES = [
  { value: "contract", label: "Contract", scenarios: false, prose: true },
  { value: "full", label: "Full", scenarios: true, prose: true },
  { value: "test", label: "Test plan", scenarios: true, prose: false },
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
 * `?at=loyalty-SC-07` rather than a fragment, because the fragment is already the route —
 * this app is hash-routed, so `#/spec/<capability>` is the address of the page and there
 * is no second `#` to spend on a position inside it. The query survives the hash, and the
 * page reads it on the way in.
 */
export function linkedScenario(search = window.location?.search ?? "") {
  return new URLSearchParams(search).get("at");
}

/** Where a scenario sits on the page: its own id when it has one, else its title. */
export const scenarioAnchor = (scenario, prefix = "") =>
  (scenario.id ?? `${prefix}-${scenario.title}`)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
