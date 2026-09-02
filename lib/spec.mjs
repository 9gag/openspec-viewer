/**
 * Reading a spec's own shapes, for a tool that is not this one.
 *
 * A spec is mostly two things — requirement prose carrying SHALL and MUST, and
 * scenarios written as WHEN/THEN steps — and neither is visible in markdown, where the
 * load-bearing words render the same as the sentences around them. Splitting a document
 * into those shapes is pure string work, and a second tool rendering the same store
 * should split it the same way rather than write its own parser to disagree with this
 * one at the edges.
 *
 * Isomorphic: no disk, no git, no React, no `window`. Safe in a build script, a test,
 * or a browser bundle. The store-side half of the package is `lib/store.mjs`.
 *
 * This is the whole contract, for the reason `lib/store.mjs` gives: `src/` is the
 * dashboard's own code and is free to move.
 */

export {
  /** A spec as ordered nodes: prose, and requirements carrying their scenarios. */
  parseSpec,
  /** The id and title inside a `#### Scenario:` heading. */
  scenarioName,
  /** Parsed scenarios by the id a reference would name them with. */
  scenarioIndex,
  /** Where a scenario sits on a page: its permanent id, else its title. */
  scenarioAnchor,
  /** The shape of a permanent scenario id, as a regex source string. */
  SCENARIO_ID,
} from "../src/spec.js";

export {
  /** A spec split into runs of steps, runs of scenario references, and markdown. */
  splitSpec,
  /** Prose split around its obligation words, for marking them up. */
  emphasize,
  /** trigger, outcome or conjunction — null for a word that is not a step keyword. */
  stepKind,
  /** Every step keyword this recognises. */
  STEP_KEYWORDS,
} from "../src/bdd.js";
