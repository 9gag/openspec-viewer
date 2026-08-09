/**
 * A link in the store's markdown is relative to the file it sits in, and the page is
 * hash-routed. Getting that resolution wrong is not a visible bug — it is a link that
 * quietly lands on a 404, which is exactly the failure this module was added to fix.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { docHref, resolveLink, splitDocArg } from "../src/links.js";

const SPEC = "openspec/specs/sample-feature/spec.md";

describe("resolveLink", () => {
  it("resolves a relative markdown link against the document it appears in", () => {
    // The shape that reported this bug: a spec citing its PRD three levels up.
    const target = resolveLink("../../../docs/prds/sample/sample-feature.md", SPEC);

    assert.equal(target.kind, "doc");
    assert.equal(target.path, "docs/prds/sample/sample-feature.md");
    assert.equal(
      target.href,
      "#/doc/docs%2Fprds%2Fsample%2Fsample-feature.md",
    );
  });

  it("resolves a sibling and a `./` link to the same place", () => {
    assert.equal(resolveLink("design.md", SPEC).path, "openspec/specs/sample-feature/design.md");
    assert.equal(resolveLink("./design.md", SPEC).path, "openspec/specs/sample-feature/design.md");
  });

  it("reads a leading slash as relative to the store root, not to the document", () => {
    assert.equal(resolveLink("/docs/README.md", SPEC).path, "docs/README.md");
  });

  it("carries a heading fragment through to the route", () => {
    const target = resolveLink("../../../docs/governance/x.md#task-format", SPEC);

    assert.equal(target.fragment, "task-format");
    assert.equal(target.path, "docs/governance/x.md");
    // One encoded segment: the router reads `#/<view>/<arg>`, and a second '#' cannot
    // survive in a hash.
    assert.equal(target.href, "#/doc/docs%2Fgovernance%2Fx.md%23task-format");
  });

  it("leaves an in-page anchor and an absolute URL alone", () => {
    assert.deepEqual(resolveLink("#requirements", SPEC), {
      kind: "anchor",
      href: "#requirements",
    });
    assert.equal(resolveLink("https://example.com/x.md", SPEC).kind, "external");
    assert.equal(resolveLink("mailto:pm@example.com", SPEC).kind, "external");
  });

  it("refuses a path that climbs out of the store rather than clamping it", () => {
    // Clamping would turn this into `etc/passwd` — a real path somewhere else — so the
    // only safe answer is that it resolves to nothing.
    const target = resolveLink("../../../../../../etc/passwd.md", SPEC);

    assert.equal(target.kind, "dead");
    assert.equal(target.reason, "outside the store");
    assert.equal(target.path, undefined);
  });

  it("marks a non-markdown link dead, keeping the path it resolved to", () => {
    const target = resolveLink("../../../designs/board.pen", SPEC);

    assert.equal(target.kind, "dead");
    assert.equal(target.path, "designs/board.pen");
  });

  it("has nowhere to resolve against when the document's own path is unknown", () => {
    // `mdComponents` withholds the override in this case; if it ever stops doing so,
    // a bare filename still has to resolve to itself rather than to an invented parent.
    assert.equal(resolveLink("x.md", "").path, "x.md");
  });
});

describe("docHref and splitDocArg", () => {
  it("round-trip a path and its fragment through one route segment", () => {
    const href = docHref("docs/prds/x.md", "measurement");
    const arg = decodeURIComponent(href.replace("#/doc/", ""));

    assert.deepEqual(splitDocArg(arg), {
      path: "docs/prds/x.md",
      fragment: "measurement",
    });
  });

  it("round-trip a path with no fragment", () => {
    const arg = decodeURIComponent(docHref("docs/prds/x.md").replace("#/doc/", ""));

    assert.deepEqual(splitDocArg(arg), {
      path: "docs/prds/x.md",
      fragment: "",
    });
  });
});
