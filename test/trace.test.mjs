import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseSpec } from "../src/spec.js";
import { splitTraces } from "../src/trace.js";

describe("splitTraces", () => {
  it("extracts scenario and case references without changing surrounding markdown", () => {
    const text = [
      "## Requirements",
      "<!-- trace:scenario id=g10.foo.SC-abc rev=2 -->",
      "#### Scenario: A case",
      "<!-- trace:case id=g10.foo.TC-xyz rev=1 covers=g10.foo.SC-abc,g10.foo.SC-def -->",
      "### Test case",
    ].join("\n");

    assert.deepEqual(splitTraces(text), [
      { type: "markdown", text: "## Requirements" },
      {
        type: "trace",
        kind: "scenario",
        id: "g10.foo.SC-abc",
        revision: "2",
        covers: [],
      },
      { type: "markdown", text: "#### Scenario: A case" },
      {
        type: "trace",
        kind: "case",
        id: "g10.foo.TC-xyz",
        revision: "1",
        covers: ["g10.foo.SC-abc", "g10.foo.SC-def"],
      },
      { type: "markdown", text: "### Test case" },
    ]);
  });

  it("leaves unrelated comments in markdown", () => {
    assert.deepEqual(splitTraces("before\n<!-- note -->\nafter"), [
      { type: "markdown", text: "before\n<!-- note -->\nafter" },
    ]);
  });
});

describe("scenario trace attachment", () => {
  it("attaches a marker to the following scenario without moving previous steps", () => {
    const nodes = parseSpec([
      "### Requirement: Cart",
      "#### Scenario: First",
      "- **WHEN** first",
      "<!-- trace:scenario id=g10.cart.SC-abc rev=1 -->",
      "#### Scenario: Second",
      "- **THEN** second",
    ].join("\n"));
    assert.equal(nodes[0].scenarios[0].text.includes("trace:"), false);
    assert.equal(nodes[0].scenarios[1].trace.id, "g10.cart.SC-abc");
    assert.match(nodes[0].scenarios[1].text, /THEN/);
  });
});
