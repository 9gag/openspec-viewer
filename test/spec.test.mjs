/**
 * Splitting a spec into the parts a reader asks for one at a time.
 *
 * The rule is the store's own document shape — `### Requirement:` and `#### Scenario:` —
 * so the cases worth pinning are the ones where a document does something the shape does
 * not obviously cover: a group heading between requirements, a scenario written without
 * the id the rules ask for, and prose that must not be cut in half on its way through.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DEFAULT_LENS,
  LENSES,
  lensRules,
  linkedScenario,
  parseSpec,
  scenarioAnchor,
  scenarioCount,
  scenarioIndex,
  scenarioName,
} from "../src/spec.js";

const SPEC = `# thing Specification

## Purpose
What it is for.

## Requirements

### Group name

---

### Requirement: The first rule
It SHALL do the thing.

| field | type |
| --- | --- |
| id | uuid |

#### Scenario: thing-SC-01 - It does the thing
- **WHEN** asked
- **THEN** it does it

#### Scenario: thing-SC-02 - It refuses otherwise
- **WHEN** not asked
- **THEN** it does not

### Requirement: The second rule
Nothing checks this one.
`;

describe("parseSpec", () => {
  const nodes = parseSpec(SPEC);
  const requirements = nodes.filter((n) => n.kind === "requirement");

  it("keeps everything that is not a requirement as prose, in order", () => {
    assert.equal(nodes[0].kind, "prose");
    assert.match(nodes[0].text, /## Purpose/);
    assert.match(nodes[0].text, /### Group name/);
  });

  it("collects each requirement with the scenarios under it", () => {
    assert.deepEqual(
      requirements.map((r) => [r.title, r.scenarios.length]),
      [
        ["The first rule", 2],
        ["The second rule", 0],
      ],
    );
    assert.equal(scenarioCount(nodes), 2);
  });

  // A table cut in half by the split would reach the markdown renderer as two fragments
  // and render as neither a table nor its text.
  it("hands a requirement's own prose over whole", () => {
    assert.match(requirements[0].text, /It SHALL do the thing/);
    assert.match(requirements[0].text, /\| id \| uuid \|/);
    // ...and the scenarios are not in it.
    assert.doesNotMatch(requirements[0].text, /WHEN/);
  });

  it("keeps a scenario's steps for the step renderer", () => {
    assert.match(requirements[0].scenarios[0].text, /\*\*WHEN\*\* asked/);
  });

  // OpenSpec ignores a `###` heading that is not a requirement, and so does this — but it
  // ends the requirement it follows, or the group heading would land inside it.
  it("ends a requirement at the next heading of its own level or above", () => {
    const [first] = parseSpec(
      "### Requirement: One\nbody\n\n## Another section\nafter\n",
    );
    assert.equal(first.kind, "requirement");
    assert.equal(first.text.trim(), "body");
  });

  it("has nothing to say about an empty document", () => {
    assert.deepEqual(parseSpec(""), []);
    assert.deepEqual(parseSpec(null), []);
  });
});

describe("scenarioName", () => {
  it("splits the id the store issues from the title", () => {
    assert.deepEqual(scenarioName("loyalty-SC-07 - Rounding happens once"), {
      id: "loyalty-SC-07",
      title: "Rounding happens once",
    });
    assert.deepEqual(
      scenarioName("admin-listing-SC-12 — An em dash separates too"),
      { id: "admin-listing-SC-12", title: "An em dash separates too" },
    );
  });

  // A spec written before the id rule, or by hand: it still renders and still anchors.
  it("keeps the whole heading when there is no id in it", () => {
    assert.deepEqual(scenarioName("Operator saves an empty draft"), {
      id: null,
      title: "Operator saves an empty draft",
    });
  });
});

describe("scenarioIndex", () => {
  const index = scenarioIndex(parseSpec(SPEC), "thing");

  it("finds a scenario by the id a reference would name it with", () => {
    assert.equal(index.get("thing-sc-01").title, "It does the thing");
    assert.match(index.get("thing-sc-01").text, /- \*\*WHEN\*\* asked/);
  });

  it("is case-insensitive, since a reference is written by hand", () => {
    assert.equal(index.get("thing-sc-02").title, "It refuses otherwise");
    assert.equal(index.get("THING-SC-02"), undefined, "keys are lowercased");
  });

  it("carries the requirement a scenario checks, which the reference cannot say", () => {
    assert.equal(index.get("thing-sc-01").requirement, "The first rule");
  });

  it("carries the anchor, so a reference and the heading agree on one address", () => {
    assert.equal(
      index.get("thing-sc-01").anchor,
      scenarioAnchor({ id: "thing-SC-01" }, "thing"),
    );
  });

  it("holds nothing for a scenario written without an id", () => {
    const nameless = parseSpec(
      "### Requirement: R\n#### Scenario: No id here\n- **WHEN** x",
    );
    assert.equal(scenarioIndex(nameless).size, 0);
  });

  it("keeps the first of a repeated id, which is the one a reader reaches first", () => {
    const twice = parseSpec(
      [
        "### Requirement: R",
        "#### Scenario: a-SC-01 - First",
        "- **WHEN** x",
        "#### Scenario: a-SC-01 - Second",
        "- **WHEN** y",
      ].join("\n"),
    );
    assert.equal(scenarioIndex(twice).get("a-sc-01").title, "First");
  });
});

describe("scenarioAnchor", () => {
  it("is the id, which is the thing a task or a review names", () => {
    assert.equal(
      scenarioAnchor({ id: "loyalty-SC-07", title: "x" }),
      "loyalty-sc-07",
    );
  });

  it("falls back to the title, prefixed, so two specs on one page do not collide", () => {
    assert.equal(
      scenarioAnchor(
        { id: null, title: "Operator saves a draft" },
        "admin/listing",
      ),
      "admin-listing-operator-saves-a-draft",
    );
  });
});

describe("lenses", () => {
  it("says what each reading leaves on the page", () => {
    assert.deepEqual(
      LENSES.map((l) => [l.value, l.prose, l.scenarios]),
      [
        ["contract", true, false],
        ["scenarios", false, true],
        ["full", true, true],
      ],
    );
  });

  it("falls back to the default for a value it does not know", () => {
    assert.equal(lensRules("nonsense").value, DEFAULT_LENS);
    assert.equal(lensRules(undefined).value, DEFAULT_LENS);
  });
});

describe("linkedScenario", () => {
  // The fragment is already the route — this app is hash-routed — so a link to a position
  // inside a page has to travel in the query.
  it("reads the scenario a link asked for", () => {
    assert.equal(linkedScenario("?at=loyalty-SC-07"), "loyalty-SC-07");
    assert.equal(linkedScenario("?mode=dark&at=thing-SC-01"), "thing-SC-01");
  });

  it("is null when the link did not ask for one", () => {
    assert.equal(linkedScenario(""), null);
    assert.equal(linkedScenario("?filter=idle"), null);
  });
});
