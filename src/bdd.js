/**
 * Reading a spec is the one thing every role on this dashboard does, and a spec is mostly
 * two shapes: requirement prose carrying SHALL/MUST, and scenarios written as WHEN/THEN
 * steps. Rendered as plain markdown they are a wall of grey with the load-bearing words
 * indistinguishable from the sentences around them.
 *
 * This splits a spec into those shapes so they can be rendered differently. Pure string
 * work, no React, because the parsing is the part that can be wrong.
 *
 * Colours come from the theme's syntax tokens rather than literal blue/green/grey, so
 * they follow light and dark and survive a theme swap. The mapping is conventional —
 * trigger blue, outcome green, conjunction muted — because that is what people already
 * read in a Gherkin file.
 */

/** Step keywords, in the order they must be matched (longest first for the NOT forms). */
const STEP_KINDS = {
  GIVEN: "trigger",
  WHEN: "trigger",
  IF: "trigger",
  THEN: "outcome",
  AND: "conjunction",
  BUT: "conjunction",
};

import { SCENARIO_ID } from "./spec.js";

/** Obligation words, which appear inline in requirement prose rather than as steps. */
const OBLIGATIONS = [
  "MUST NOT",
  "SHALL NOT",
  "MUST",
  "SHALL",
  "SHOULD NOT",
  "SHOULD",
];

export const STEP_KEYWORDS = Object.keys(STEP_KINDS);

// `- **WHEN** …`, `* WHEN …`, `- When …`. OpenSpec's own convention is the bold list form;
// the others cost nothing to accept and show up in hand-written specs.
const STEP = /^\s*[-*]\s+(?:\*\*)?([A-Za-z]+)(?:\*\*)?[:\s]\s*(.*)$/;

// `- \`loyalty-SC-07\` — Rounding happens once`: a list item that is nothing but a pointer
// at a scenario defined elsewhere in the document. This is how the store writes a journey's
// "Accepted by" and a test case's "Covers". The title after the dash is the store repeating
// the scenario's own, so it is optional here — the id is the part that resolves.
const REF = new RegExp(
  String.raw`^\s*[-*]\s+\`(${SCENARIO_ID})\`(?:\s*[-–—:]\s*(.*))?\s*$`,
  "i",
);

export const stepKind = (word) => STEP_KINDS[word.toUpperCase()] ?? null;

/**
 * Split a spec into runs of scenario steps and everything else.
 *
 * Markdown is only split at step boundaries, and a step is a whole list item, so no
 * construct is ever cut in half — the surrounding prose is still handed to the markdown
 * renderer intact.
 */
export function splitSpec(text) {
  const blocks = [];
  let prose = [];
  let steps = [];
  let refs = [];

  const flushProse = () => {
    if (prose.join("").trim())
      blocks.push({ type: "markdown", text: prose.join("\n") });
    prose = [];
  };
  const flushSteps = () => {
    if (steps.length) blocks.push({ type: "steps", steps });
    steps = [];
  };
  const flushRefs = () => {
    if (refs.length) blocks.push({ type: "refs", refs });
    refs = [];
  };

  for (const line of text.split("\n")) {
    // Before the step test, which a reference cannot pass anyway — it opens with a
    // backtick where a keyword would be — but the order is the one that survives someone
    // loosening either pattern later.
    const ref = line.match(REF);
    if (ref) {
      flushProse();
      flushSteps();
      refs.push({ id: ref[1], title: (ref[2] ?? "").trim() });
      continue;
    }

    const match = line.match(STEP);
    const kind = match && stepKind(match[1]);

    if (kind) {
      flushProse();
      flushRefs();
      steps.push({
        keyword: match[1].toUpperCase(),
        kind,
        text: match[2].trim(),
      });
      continue;
    }

    flushSteps();
    flushRefs();
    prose.push(line);
  }

  flushSteps();
  flushRefs();
  flushProse();
  return blocks;
}

/**
 * Split a run of prose around its obligation words.
 *
 * Returns plain `{ text, kind }` parts so the caller decides how to render them — the
 * same reason this file has no JSX in it.
 */
export function emphasize(text) {
  const pattern = new RegExp(`\\b(${OBLIGATIONS.join("|")})\\b`, "g");
  const parts = [];
  let last = 0;

  for (const match of text.matchAll(pattern)) {
    if (match.index > last)
      parts.push({ text: text.slice(last, match.index), kind: null });
    parts.push({ text: match[0], kind: "obligation" });
    last = match.index + match[0].length;
  }

  if (last < text.length) parts.push({ text: text.slice(last), kind: null });
  return parts;
}
