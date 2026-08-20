/**
 * The tabs on a change page are that change's own files, so the tab you were reading is
 * not necessarily a tab the next change has. Landing on a blank page is how a tool stops
 * being opened, and it is invisible in a build — nothing errors, there is simply nothing
 * on screen.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveTab } from "../src/tabs.js";

describe("resolveTab", () => {
  const artifacts = [
    { name: "proposal" },
    { name: "specs" },
    { name: "design" },
    { name: "tasks" },
  ];

  it("stays on the tab being read when the change has it", () => {
    assert.equal(resolveTab(artifacts, "tasks"), "tasks");
  });

  it("falls back to the first artifact rather than showing nothing", () => {
    // 'ui' is only in some schemas: reading a full-planning change and then opening a
    // spec-driven one leaves the tab naming a file that change does not have.
    assert.equal(resolveTab(artifacts, "ui"), "proposal");
  });

  it("opens on the first artifact when nothing is selected yet", () => {
    assert.equal(resolveTab(artifacts, null), "proposal");
  });

  it("survives a change with no artifacts at all", () => {
    assert.equal(resolveTab([], "proposal"), null);
  });
});
