/**
 * The tabs on a change page are that change's own files, so the tab you were reading is
 * not necessarily a tab the next change has. Landing on a blank page is how a tool stops
 * being opened, and it is invisible in a build — nothing errors, there is simply nothing
 * on screen.
 *
 * The same goes the other way for the documents a store keeps beside its specs: a tab
 * that is never built is a file nobody knows is there.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { capabilityDocTabs, resolveTab } from "../src/tabs.js";

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

describe("capabilityDocTabs", () => {
  const cap = (capability, ...names) => ({
    capability,
    docs: names.map((name) => ({
      name,
      label: name,
      file: `${name}.md`,
      path: `openspec/changes/guest-checkout/specs/${capability}/${name}.md`,
    })),
  });

  it("gives a tab to what a spec directory holds besides its spec", () => {
    const tabs = capabilityDocTabs(
      [cap("storefront/checkout", "test-cases")],
      [],
    );
    assert.deepEqual(
      tabs.map((t) => [t.name, t.kind]),
      [["test-cases", "capability-doc"]],
    );
  });

  it("collects one filename from every capability under one tab", () => {
    // Three tabs all labelled "Test Cases" is a tab bar that names nothing. Under one
    // tab they are what the Requirements tab already is: a document per capability.
    const tabs = capabilityDocTabs(
      [
        cap("storefront/checkout", "test-cases"),
        cap("shared/ui/cart", "test-cases"),
      ],
      [],
    );
    assert.equal(tabs.length, 1);
    assert.deepEqual(
      tabs[0].docs.map((d) => d.capability),
      ["storefront/checkout", "shared/ui/cart"],
    );
  });

  it("leaves a name the change's own directory uses to that artifact", () => {
    // A change carrying its own README.md already has a tab called README, and it is
    // that file the tab bar has always meant. Two tabs of one name is a page where
    // clicking either one is a guess.
    const tabs = capabilityDocTabs(
      [cap("storefront/checkout", "README")],
      [{ name: "README" }],
    );
    assert.deepEqual(tabs, []);
  });

  it("adds nothing for a change whose deltas are only specs", () => {
    assert.deepEqual(capabilityDocTabs([cap("storefront/checkout")], []), []);
    assert.deepEqual(capabilityDocTabs([], []), []);
  });
});
