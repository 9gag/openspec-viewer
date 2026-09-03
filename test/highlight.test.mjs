/**
 * What a link to a heading is pointing at. The rule decides how much of a document is
 * marked on arrival, and getting it wrong is either a mark on one line of a long section
 * or a mark over the rest of the page.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { headingLevel, sectionSpan } from "../src/highlight.js";

describe("headingLevel", () => {
  it("reads the level off a heading tag, however it is cased", () => {
    assert.equal(headingLevel("H1"), 1);
    assert.equal(headingLevel("h3"), 3);
    assert.equal(headingLevel("H6"), 6);
  });

  it("is zero for anything that is not a heading", () => {
    assert.equal(headingLevel("P"), 0);
    assert.equal(headingLevel("SECTION"), 0);
    assert.equal(headingLevel("H7"), 0);
    assert.equal(headingLevel(undefined), 0);
  });
});

describe("sectionSpan", () => {
  // A proposal: two sections, the first with a sub-heading inside it.
  const doc = ["H2", "P", "H3", "P", "UL", "H2", "P"];

  it("takes the heading and everything under it, down to the next of its level", () => {
    assert.deepEqual(sectionSpan(doc, 0), [0, 1, 2, 3, 4]);
  });

  it("takes only its own part when the heading is a sub-heading", () => {
    assert.deepEqual(sectionSpan(doc, 2), [2, 3, 4]);
  });

  it("runs to the end of the document for the last section", () => {
    assert.deepEqual(sectionSpan(doc, 5), [5, 6]);
  });

  it("stops at a heading above its own level, not only at its equal", () => {
    assert.deepEqual(sectionSpan(["H3", "P", "H2", "P"], 0), [0, 1]);
  });

  it("is the element alone when what was named is not a heading", () => {
    // A scenario is a <section> with an id; there is no level to end the run on, and
    // marking the rest of the document is not what the link asked for.
    assert.deepEqual(sectionSpan(["P", "SECTION", "P", "H2"], 1), [1]);
  });

  it("is empty when the position is not in the document", () => {
    assert.deepEqual(sectionSpan(doc, -1), []);
    assert.deepEqual(sectionSpan(doc, 12), []);
  });
});
