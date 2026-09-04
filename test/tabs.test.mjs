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

import { changeTabs, resolveTab, tabAsked, tabForAnchor } from "../src/tabs.js";

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

describe("changeTabs", () => {
  const cap = (capability, ...names) => ({
    capability,
    docs: names.map((name) => ({
      name,
      label: name,
      file: `${name}.md`,
      path: `openspec/changes/guest-checkout/specs/${capability}/${name}.md`,
    })),
  });

  /** What the schema declares a change generates per capability. */
  const declares = (id, file) => ({
    name: id,
    label: id,
    kind: "capability-doc",
    file,
  });

  it("keeps the schema's artifacts in the schema's order", () => {
    const artifacts = [
      { name: "proposal", kind: "doc" },
      { name: "specs", kind: "specs" },
      declares("user-journeys", "user-journeys.md"),
      { name: "tasks", kind: "tasks" },
    ];
    const tabs = changeTabs(artifacts, [
      cap("storefront/checkout", "user-journeys"),
    ]);

    assert.deepEqual(
      tabs.map((t) => t.name),
      ["proposal", "specs", "user-journeys", "tasks"],
    );
  });

  it("hands a declared per-capability artifact its own documents", () => {
    // Its glob ends in a filename of its own, so it is an artifact of the change and not
    // the delta — a tab that renders the spec deltas instead is three tabs showing one
    // document, and the file the schema asked for is on disk with no page that opens it.
    const tabs = changeTabs(
      [declares("user-journeys", "user-journeys.md")],
      [
        cap("storefront/checkout", "user-journeys", "test-cases"),
        cap("shared/ui/cart", "user-journeys"),
      ],
    );

    assert.equal(tabs[0].kind, "capability-doc");
    assert.deepEqual(
      tabs[0].docs.map((d) => d.capability),
      ["storefront/checkout", "shared/ui/cart"],
    );
  });

  it("collects the file the artifact generates, not the id it is called by", () => {
    // A schema names the two independently: the tab is called whatever the artifact is
    // called, and it holds whatever that artifact writes.
    const tabs = changeTabs(
      [declares("journeys", "user-journeys.md")],
      [cap("storefront/checkout", "user-journeys")],
    );

    assert.equal(tabs.length, 1);
    assert.equal(tabs[0].name, "journeys");
    assert.deepEqual(
      tabs[0].docs.map((d) => d.name),
      ["user-journeys"],
    );
  });

  it("gives a tab to what a spec directory holds besides its spec", () => {
    const tabs = changeTabs([], [cap("storefront/checkout", "test-cases")]);
    assert.deepEqual(
      tabs.map((t) => [t.name, t.kind]),
      [["test-cases", "capability-doc"]],
    );
  });

  it("collects one filename from every capability under one tab", () => {
    // Three tabs all labelled "Test Cases" is a tab bar that names nothing. Under one
    // tab they are what the Requirements tab already is: a document per capability.
    const tabs = changeTabs(
      [],
      [
        cap("storefront/checkout", "test-cases"),
        cap("shared/ui/cart", "test-cases"),
      ],
    );
    assert.equal(tabs.length, 1);
    assert.deepEqual(
      tabs[0].docs.map((d) => d.capability),
      ["storefront/checkout", "shared/ui/cart"],
    );
  });

  it("does not list a file twice when the schema already declared it", () => {
    const tabs = changeTabs(
      [declares("test-cases", "test-cases.md")],
      [cap("storefront/checkout", "test-cases")],
    );
    assert.equal(tabs.length, 1);
  });

  it("leaves a name the change's own directory uses to that artifact", () => {
    // A change carrying its own README.md already has a tab called README, and it is
    // that file the tab bar has always meant. Two tabs of one name is a page where
    // clicking either one is a guess.
    const tabs = changeTabs(
      [{ name: "README", kind: "doc" }],
      [cap("storefront/checkout", "README")],
    );
    assert.deepEqual(
      tabs.map((t) => t.name),
      ["README"],
    );
  });

  it("adds nothing for a change whose deltas are only specs", () => {
    assert.deepEqual(changeTabs([], [cap("storefront/checkout")]), []);
    assert.deepEqual(changeTabs([], []), []);
  });
});

/**
 * Where a link to a heading lands.
 *
 * A change is a tab bar over several documents and only one is on screen, so a link that
 * names a heading has to say which — otherwise it opens the change's first artifact with
 * the heading two tabs away, on a page that has already given up looking for it. The
 * anchor already carries the answer: it is prefixed with the document it was rendered in.
 */
describe("tabForAnchor", () => {
  const tabs = [
    { name: "proposal" },
    { name: "specs", prefixes: ["storefront/checkout", "shared/ui/cart"] },
    { name: "tech-design" },
    { name: "test-cases", prefixes: ["storefront/checkout"] },
  ];

  it("opens the artifact whose name the anchor carries", () => {
    assert.equal(
      tabForAnchor("tech-design--7-source-expansion-happens-first", tabs),
      "tech-design",
    );
  });

  it("opens the deltas for a heading inside a spec", () => {
    // A spec is prefixed with its capability rather than the tab, because one tab stacks
    // several capabilities and every spec has a "Purpose".
    assert.equal(tabForAnchor("storefront/checkout--purpose", tabs), "specs");
  });

  it("splits at the first double dash, whatever the prefix holds", () => {
    // Slugs are runs of non-alphanumerics collapsed to one dash, so they never contain a
    // double one — the boundary is unambiguous even for a path with dashes in it.
    assert.equal(
      tabForAnchor("shared/ui/cart--a-heading-with-many-dashes", tabs),
      "specs",
    );
  });

  it("is null for an anchor no tab claims", () => {
    // A link from another change, or one whose document is no longer there. Opening some
    // tab anyway would be a guess dressed as an answer.
    assert.equal(tabForAnchor("ui-design--the-shape", tabs), null);
    assert.equal(tabForAnchor("", tabs), null);
    assert.equal(tabForAnchor(null, tabs), null);
  });
});

/**
 * Which tab a link opens the change on, when the route names none of its own.
 *
 * A citation writes `#/change/<id>?at=<scenario>` and a copied heading writes
 * `#/change/<id>/<tab>?to=<heading>` — so the position is the only thing some links carry,
 * and without reading it the link lands on the change's first artifact with the thing it
 * named two tabs away.
 */
describe("tabAsked", () => {
  const tabs = [
    { name: "proposal" },
    { name: "specs", kind: "specs" },
    { name: "design" },
    {
      name: "test-cases",
      kind: "capability-doc",
      docs: [{ capability: "cart" }],
    },
  ];
  const data = {
    capabilities: [
      {
        capability: "storefront/checkout",
        text: "#### Scenario: store-cart-SC-01\n- **WHEN** x\n",
      },
      { capability: "cart", text: "" },
    ],
  };
  const asking = (to = null, at = null) => ({ to, at });

  it("opens the tab whose name the heading carries", () => {
    assert.equal(tabAsked(data, tabs, asking("design--the-shape")), "design");
  });

  it("opens the deltas for a heading prefixed with a capability", () => {
    // One tab stacks every capability the change deltas, so a spec's heading is prefixed
    // with the capability rather than with the tab.
    assert.equal(
      tabAsked(data, tabs, asking("storefront/checkout--purpose")),
      "specs",
    );
  });

  it("opens the deltas for a scenario the change defines", () => {
    assert.equal(
      tabAsked(data, tabs, asking(null, "store-cart-SC-01")),
      "specs",
    );
  });

  it("is null for a scenario this change does not define", () => {
    // A citation resolved to some other change. Opening the deltas anyway would show a
    // page that does not contain the thing the reader clicked.
    assert.equal(tabAsked(data, tabs, asking(null, "loyalty-SC-09")), null);
  });

  it("is null when the link named no position at all", () => {
    assert.equal(tabAsked(data, tabs, asking()), null);
  });

  it("prefers the heading when a link somehow carries both", () => {
    assert.equal(
      tabAsked(data, tabs, asking("design--the-shape", "store-cart-SC-01")),
      "design",
    );
  });

  it("does not mistake a scenario id for a regular expression", () => {
    // The id goes into a RegExp to find its `#### Scenario:` heading, and ids come off the
    // wire — a store is free to name one with a character that means something there.
    assert.equal(tabAsked(data, tabs, asking(null, "store.cart.SC.01")), null);
  });
});
