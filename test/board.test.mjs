/**
 * The simplified board reads in two columns, and where it splits decides whether the
 * second one is a stub beside a column three screens long. These pin the split to the
 * lines a band actually draws rather than the number of bands.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { splitIntoColumns } from "../src/board.js";

/** A band drawing `n` change rows, plus whatever hangs under it. */
const band = (path, n, children = []) => ({
  path,
  name: path,
  count: n,
  items: Array.from({ length: n }, (_, i) => ({ id: `${path}-${i}` })),
  children,
});

const paths = (nodes) => nodes.map((n) => n.path);

describe("splitIntoColumns", () => {
  it("leaves a single band alone rather than splitting it off from nothing", () => {
    const [left, right] = splitIntoColumns([band("a", 4)]);
    assert.deepEqual(paths(left), ["a"]);
    assert.deepEqual(right, []);
  });

  it("has nothing to split when the board is empty", () => {
    assert.deepEqual(splitIntoColumns([]), [[], []]);
  });

  it("keeps reading order: the first column holds the first bands", () => {
    const [left, right] = splitIntoColumns([
      band("a", 5),
      band("b", 5),
      band("c", 5),
      band("d", 5),
    ]);
    assert.deepEqual(paths(left), ["a", "b"]);
    assert.deepEqual(paths(right), ["c", "d"]);
  });

  it("splits where the two columns come out closest in height", () => {
    // 11 lines, then 2, 2, 2 — cutting after the big one is the even split, even though
    // it puts one band on the left and three on the right.
    const [left, right] = splitIntoColumns([
      band("big", 10),
      band("a", 1),
      band("b", 1),
      band("c", 1),
    ]);
    assert.deepEqual(paths(left), ["big"]);
    assert.deepEqual(paths(right), ["a", "b", "c"]);
  });

  it("counts the lines inside a band, not the band", () => {
    // Two bands: one heading with ten rows under a child, one heading with one row. A
    // split that counted bands would call these equal and put one in each column.
    const [left, right] = splitIntoColumns([
      band("deep", 0, [band("deep/x", 5), band("deep/y", 5)]),
      band("small", 1),
      band("small2", 1),
      band("small3", 1),
      band("small4", 1),
      band("small5", 1),
      band("small6", 1),
      band("small7", 1),
    ]);
    // 13 lines against 14: counting bands would have cut this four and four, and left a
    // column of thirteen lines beside a column of eight.
    assert.deepEqual(paths(left), ["deep"]);
    assert.equal(right.length, 7);
  });

  it("never empties the second column when there is more than one band", () => {
    const [left, right] = splitIntoColumns([band("huge", 50), band("tiny", 1)]);
    assert.deepEqual(paths(left), ["huge"]);
    assert.deepEqual(paths(right), ["tiny"]);
  });
});
