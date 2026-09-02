/**
 * Spec highlighting is only worth having if it never eats content. A parser that splits a
 * document into "the bits I understand" and "everything else" fails quietly — the missing
 * paragraph looks like a spec that was never written, which on this dashboard is a
 * meaningful and wrong statement.
 *
 * So the load-bearing test is the round trip: every line in, every line out.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { emphasize, splitSpec, stepKind } from "../src/bdd.js";

const SPEC = [
  "### Requirement: Cart holds line items",
  "",
  "The cart SHALL hold one line item per distinct product. Adding a product already in",
  "the cart SHALL increase that line quantity rather than create a second line.",
  "",
  "#### Scenario: Adding a new product",
  "",
  "- **WHEN** a shopper adds a product that is not in the cart",
  "- **THEN** the cart contains one line for that product",
  "",
  "#### Scenario: Removing it",
  "",
  "- **WHEN** a shopper sets a line quantity to zero",
  "- **AND** the cart is otherwise empty",
  "- **THEN** the line is removed",
].join("\n");

/** A journey and the scenarios it names, which is the store's other list shape. */
const JOURNEY = [
  "### cart-US-01: Shopper builds a cart",
  "",
  "**Accepted by:**",
  "",
  "- `cart-SC-01` — Adding a new product",
  "- `cart-SC-02` — Removing it",
  "",
  "Nothing else accepts it.",
].join("\n");

/** Every block turned back into the lines it came from, whatever kind it is. */
const relines = (blocks) =>
  blocks
    .flatMap((b) => {
      if (b.type === "markdown") return b.text.split("\n");
      if (b.type === "steps")
        return b.steps.map((s) => `- **${s.keyword}** ${s.text}`);
      return b.refs.map((r) => `- \`${r.id}\` — ${r.title}`);
    })
    .join("\n");

const normalise = (s) =>
  s
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");

describe("splitSpec", () => {
  it("keeps every line, so nothing can be silently dropped", () => {
    assert.equal(normalise(relines(splitSpec(SPEC))), normalise(SPEC));
  });

  it("keeps every line of a reference list too", () => {
    assert.equal(normalise(relines(splitSpec(JOURNEY))), normalise(JOURNEY));
  });

  it("pulls a run of scenario references out, id and title apart", () => {
    const refs = splitSpec(JOURNEY).filter((b) => b.type === "refs");
    assert.equal(refs.length, 1, "one run, not one block per item");
    assert.deepEqual(refs[0].refs, [
      { id: "cart-SC-01", title: "Adding a new product" },
      { id: "cart-SC-02", title: "Removing it" },
    ]);
  });

  it("takes a reference without a title, since the id is the part that resolves", () => {
    const [block] = splitSpec("- `cart-SC-09`");
    assert.equal(block.type, "refs");
    assert.deepEqual(block.refs, [{ id: "cart-SC-09", title: "" }]);
  });

  it("leaves a bullet that merely mentions an id as markdown", () => {
    const blocks = splitSpec("- see `cart-SC-01` for the rounding case");
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["markdown"],
    );
  });

  it("pulls each scenario run out as steps and leaves prose as markdown", () => {
    const blocks = splitSpec(SPEC);
    const steps = blocks.filter((b) => b.type === "steps");
    assert.equal(steps.length, 2, "two scenarios, two runs");
    assert.deepEqual(
      steps[0].steps.map((s) => s.keyword),
      ["WHEN", "THEN"],
    );
    assert.deepEqual(
      steps[1].steps.map((s) => [s.keyword, s.kind]),
      [
        ["WHEN", "trigger"],
        ["AND", "conjunction"],
        ["THEN", "outcome"],
      ],
    );
  });

  it("keeps the requirement heading and prose with the markdown renderer", () => {
    const md = splitSpec(SPEC)
      .filter((b) => b.type === "markdown")
      .map((b) => b.text)
      .join("\n");
    assert.match(md, /### Requirement: Cart holds line items/);
    assert.match(md, /#### Scenario: Adding a new product/);
    assert.match(md, /SHALL hold one line item/);
  });

  it("does not treat an ordinary bullet as a step", () => {
    const blocks = splitSpec("- a plain list item\n- another one");
    assert.deepEqual(
      blocks.map((b) => b.type),
      ["markdown"],
    );
  });

  it("accepts unbolded and lowercase step keywords", () => {
    const [block] = splitSpec("- when a shopper waits\n* Then it expires");
    assert.equal(block.type, "steps");
    assert.deepEqual(
      block.steps.map((s) => s.keyword),
      ["WHEN", "THEN"],
    );
  });

  it("returns nothing for empty input rather than an empty block", () => {
    assert.deepEqual(splitSpec(""), []);
    assert.deepEqual(splitSpec("\n\n  \n"), []);
  });
});

describe("stepKind", () => {
  it("classifies triggers, outcomes and conjunctions", () => {
    assert.equal(stepKind("WHEN"), "trigger");
    assert.equal(stepKind("given"), "trigger");
    assert.equal(stepKind("THEN"), "outcome");
    assert.equal(stepKind("AND"), "conjunction");
  });

  it("is null for anything else, so ordinary words are never coloured", () => {
    assert.equal(stepKind("SHALL"), null);
    assert.equal(stepKind("the"), null);
  });
});

describe("emphasize", () => {
  const text = (parts) => parts.map((p) => p.text).join("");

  it("marks obligations without changing the sentence", () => {
    const parts = emphasize(
      "The cart SHALL hold one line and MUST NOT duplicate it.",
    );
    assert.equal(
      text(parts),
      "The cart SHALL hold one line and MUST NOT duplicate it.",
    );
    assert.deepEqual(
      parts.filter((p) => p.kind).map((p) => p.text),
      ["SHALL", "MUST NOT"],
    );
  });

  it("prefers the negated form over the bare one", () => {
    const parts = emphasize("It SHALL NOT happen.");
    assert.deepEqual(
      parts.filter((p) => p.kind).map((p) => p.text),
      ["SHALL NOT"],
    );
  });

  it("leaves prose with no obligations as a single plain part", () => {
    const parts = emphasize("Just a sentence.");
    assert.deepEqual(parts, [{ text: "Just a sentence.", kind: null }]);
  });

  it("does not match obligations inside longer words", () => {
    const parts = emphasize("The MUSTARD is fine and marshall too.");
    assert.deepEqual(
      parts.filter((p) => p.kind),
      [],
    );
  });
});
