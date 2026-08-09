/**
 * The path handed to `/api/doc` comes from a link inside a document, which is to say
 * from data the server did not write. `storeRelative` is the only thing deciding what
 * that data can name, so these pin the boundary rather than the reading.
 */

import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { storeRelative } from "../server/doc.mjs";

const root = mkdtempSync(join(tmpdir(), "openspec-viewer-doc-"));
mkdirSync(join(root, "docs", "prds"), { recursive: true });
writeFileSync(join(root, "docs", "prds", "x.md"), "# X\n");

after(() => rmSync(root, { recursive: true, force: true }));

describe("storeRelative", () => {
  it("accepts markdown inside the store and reports it as a URL path", () => {
    const found = storeRelative(root, "docs/prds/x.md");

    assert.equal(found.rel, "docs/prds/x.md");
    assert.equal(found.abs, join(root, "docs", "prds", "x.md"));
  });

  it("normalizes so one document has one identity", () => {
    assert.equal(storeRelative(root, "docs/./prds/../prds/x.md").rel, "docs/prds/x.md");
  });

  it("refuses a path that escapes the store", () => {
    assert.equal(storeRelative(root, "../../../etc/passwd.md"), null);
    assert.equal(storeRelative(root, "docs/../../outside.md"), null);
  });

  it("refuses an absolute path", () => {
    assert.equal(storeRelative(root, "/etc/passwd.md"), null);
  });

  it("refuses anything that is not markdown", () => {
    // The viewer renders markdown; widening this would make it a file server for a
    // directory that also holds a git checkout.
    assert.equal(storeRelative(root, "docs/prds/.env"), null);
    assert.equal(storeRelative(root, "pnpm-lock.yaml"), null);
    assert.equal(storeRelative(root, ".git/config"), null);
  });

  it("refuses an empty path rather than resolving it to the store root", () => {
    assert.equal(storeRelative(root, ""), null);
    assert.equal(storeRelative(root, undefined), null);
  });

  it("does not require the file to exist — reading is a separate question", () => {
    // Confinement and existence are answered separately so a missing file and a
    // forbidden one cannot be told apart by the shape of the failure.
    assert.equal(storeRelative(root, "docs/nope.md").rel, "docs/nope.md");
  });
});
