/**
 * tasks.md is written by hand and hard-wrapped, so a task routinely spans several lines.
 * The parser is the only place that knows a task is a list item rather than a line, and
 * getting it wrong truncates the instruction silently — the board still looks right.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parse } from "../server/board.mjs";

describe("parse", () => {
  it("joins the wrapped remainder of a task into its text", () => {
    const [group] = parse(
      [
        "## 3. Proof in a browser",
        "",
        "- [ ] 3.1 Make **An extension empties the slot** and **The pitch leads to",
        "      the subscription screen** pass: add `e2e/ad-slot.spec.ts` driving the",
        "      real export.",
        "- [x] 3.2 Verify: `pnpm e2e:web:run` against a production export.",
        "",
      ].join("\n"),
    );

    assert.equal(group.tasks.length, 2);
    assert.equal(
      group.tasks[0].text,
      "Make **An extension empties the slot** and **The pitch leads to the subscription screen** pass: add `e2e/ad-slot.spec.ts` driving the real export.",
    );
    assert.equal(group.tasks[0].done, false);
    assert.equal(group.tasks[1].done, true);
    assert.equal(
      group.tasks[1].text,
      "Verify: `pnpm e2e:web:run` against a production export.",
    );
  });

  it("ends a task at a blank line, a heading or the next item", () => {
    const groups = parse(
      [
        "## 1. First",
        "- [ ] 1.1 One",
        "",
        "      Detached prose that belongs to no task.",
        "- [ ] 1.2 Two",
        "## 2. Second",
        "      Stray indent under a heading.",
        "- [ ] 2.1 Three",
        "",
      ].join("\n"),
    );

    assert.deepEqual(
      groups.map((g) => g.tasks.map((t) => t.text)),
      [
        ["One", "Two"],
        ["Three"],
      ],
    );
  });

  it("keeps a nested checklist item a task of its own", () => {
    const [group] = parse(
      ["## 1. First", "- [ ] 1.1 Parent", "  - [x] 1.1.1 Child", ""].join("\n"),
    );

    assert.deepEqual(
      group.tasks.map((t) => [t.id, t.text, t.done]),
      [
        ["1.1", "Parent", false],
        ["1.1.1", "Child", true],
      ],
    );
  });

  it("reads the owner off the group heading", () => {
    const [group] = parse(
      "## 2. The slot renders (owner: @Dana)\n- [ ] 2.1 Go\n",
    );
    assert.equal(group.owner, "dana");
    assert.equal(group.title, "The slot renders");
  });
});
