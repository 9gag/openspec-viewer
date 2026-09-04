/**
 * A snapshot is two halves that never meet: a writer filing answers on one machine, and
 * a page asking for them on another, later. What holds them together is one function
 * naming the file for a request, so that function is what these pin — a page asking at
 * one path for a file the writer left at another is a snapshot that reads as an empty
 * store, with nothing anywhere to say why.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, it } from "node:test";

import { snapshotRequests, storeDocuments } from "../server/snapshot.mjs";
import { searchDocuments } from "../src/search.js";
import {
  corpusPath,
  requestFor,
  SNAPSHOT_META,
  snapshotPath,
  stamp,
} from "../src/snapshot.js";

describe("snapshotPath", () => {
  it("files a whole answer under its route", () => {
    assert.equal(snapshotPath("/api/board"), "api/board.json");
    assert.equal(snapshotPath("/api/specs"), "api/specs.json");
    assert.equal(snapshotPath("/api/archive"), "api/archive.json");
  });

  it("files an answer with an argument under that argument", () => {
    assert.equal(
      snapshotPath("/api/change?id=add-guest-checkout"),
      "api/change/add-guest-checkout.json",
    );
    assert.equal(
      snapshotPath("/api/validate?id=add-guest-checkout"),
      "api/validate/add-guest-checkout.json",
    );
  });

  it("keeps the slashes a capability or a document path carries", () => {
    assert.equal(
      snapshotPath("/api/spec?id=storefront%2Fcheckout"),
      "api/spec/storefront/checkout.json",
    );
    assert.equal(
      snapshotPath("/api/doc?path=docs%2Fprds%2Fcart.md"),
      "api/doc/docs/prds/cart.md.json",
    );
  });

  it("encodes what a URL would not carry as a segment", () => {
    assert.equal(
      snapshotPath("/api/doc?path=docs%2Fa%20note.md"),
      "api/doc/docs/a%20note.md.json",
    );
  });

  it("is relative, so the page resolves it against wherever it is mounted", () => {
    assert.ok(!snapshotPath("/api/board").startsWith("/"));
    assert.ok(!corpusPath(false).startsWith("/"));
  });

  it("has no file for a search, which is answered from the corpus", () => {
    assert.throws(() => snapshotPath("/api/search?q=cart"), /no snapshot/);
  });

  it("refuses an argument it was not given", () => {
    assert.throws(() => snapshotPath("/api/change"), /missing \?id/);
  });
});

describe("stamp", () => {
  it("puts the snapshot tag in the page's head and changes nothing else", () => {
    const html =
      "<!doctype html>\n<html>\n  <head>\n    <title>x</title>\n  </head>\n</html>\n";
    const out = stamp(html, "2026-01-02T03:04:05.000Z");

    assert.match(
      out,
      new RegExp(
        `<head>\\s*<meta name="${SNAPSHOT_META}" content="2026-01-02T03:04:05.000Z" />`,
      ),
    );
    assert.equal(out.replace(/<meta[^>]*>\n\s*/, ""), html);
  });
});

describe("storeDocuments", () => {
  const root = mkdtempSync(join(tmpdir(), "openspec-viewer-snapshot-"));
  after(() => rmSync(root, { recursive: true, force: true }));

  it("lists every markdown file in a store with no history, skipping what no store publishes", () => {
    for (const path of [
      "README.md",
      "docs/prds/cart.md",
      "openspec/specs/cart/spec.md",
      "node_modules/x/README.md",
      ".git/description.md",
      "dist/index.md",
      "src/notes.txt",
    ]) {
      mkdirSync(join(root, path, ".."), { recursive: true });
      writeFileSync(join(root, path), "# x\n");
    }

    // The order is the writer's business, not the reader's: every file is written whatever
    // it is.
    assert.deepEqual(storeDocuments(root).sort(), [
      "README.md",
      "docs/prds/cart.md",
      "openspec/specs/cart/spec.md",
    ]);
  });
});

describe("searchDocuments", () => {
  // The browser runs this over the shipped corpus; the server runs it over the files it
  // read. One case here, so that a change to the shape of an answer breaks in the suite
  // rather than in a search box.
  it("answers in the shape the search view reads", () => {
    const answer = searchDocuments(
      [
        {
          path: "openspec/specs/cart/spec.md",
          text: "# Cart\nThe cart holds items.\n",
        },
        {
          path: "openspec/changes/guest-checkout/proposal.md",
          text: "No cart here.\n",
        },
      ],
      "cart",
    );

    assert.equal(answer.scanned, 2);
    assert.equal(answer.matched, 2);
    assert.equal(answer.results[0].path, "openspec/specs/cart/spec.md");
    assert.equal(answer.results[0].scope, "baseline");
    assert.equal(answer.results[0].defines, true);
    assert.equal(answer.results[1].scope, "development");
  });
});

describe("requestFor", () => {
  // The writer files by `snapshotPath`; a host standing in for the files reads the name
  // back with this. Every request the page can make has to survive the round trip, or
  // the host answers a different question than the page asked.
  const requests = [
    "/api/board",
    "/api/specs",
    "/api/archive",
    "/api/change?id=add-guest-checkout",
    "/api/validate?id=add-guest-checkout",
    "/api/spec?id=storefront%2Fcheckout",
    "/api/doc?path=docs%2Fprds%2Fcart.md",
    "/api/doc?path=docs%2Fa%20note.md",
    "/api/corpus",
    "/api/corpus?archive=1",
  ];

  for (const request of requests) {
    it(`reads ${request} back from its file`, () => {
      assert.equal(requestFor(snapshotPath(request)), request);
    });
  }

  it("files the corpus where the page looks for it", () => {
    assert.equal(snapshotPath("/api/corpus"), corpusPath(false));
    assert.equal(snapshotPath("/api/corpus?archive=1"), corpusPath(true));
  });

  it("is null for a path no snapshot writes", () => {
    assert.equal(requestFor("api/nothing.json"), null);
    assert.equal(requestFor("api/board/extra.json"), null);
    assert.equal(requestFor("api/change.json"), null);
    assert.equal(requestFor("assets/index.js"), null);
  });
});

describe("snapshotRequests", () => {
  // The board, the catalogue and the archive as the routes answer them, cut to the
  // fields the enumeration reads. A snapshot that asks for the wrong set is a page with
  // a change missing from it and nothing to say which.
  const store = {
    board: { changes: [{ id: "guest-checkout" }, { id: "stock-alerts" }] },
    catalog: { specs: [{ capability: "cart" }, { capability: "shared/ui" }] },
    archive: { archive: [{ id: "2026-01-09-cart-totals" }] },
    documents: ["openspec/specs/cart/spec.md", "docs/prds/a note.md"],
  };

  it("asks for every change, shipped as well as in development", () => {
    assert.deepEqual(snapshotRequests(store).changes, [
      "/api/change?id=guest-checkout",
      "/api/change?id=stock-alerts",
      "/api/change?id=2026-01-09-cart-totals",
    ]);
  });

  it("validates the changes in development and no others", () => {
    assert.deepEqual(snapshotRequests(store).validated, [
      "/api/validate?id=guest-checkout",
      "/api/validate?id=stock-alerts",
    ]);
  });

  it("asks nothing of the CLI when validation is off", () => {
    assert.deepEqual(
      snapshotRequests(store, { validate: false }).validated,
      [],
    );
  });

  it("asks for every capability and every document the store tracks", () => {
    const requests = snapshotRequests(store);
    assert.deepEqual(requests.specs, [
      "/api/spec?id=cart",
      "/api/spec?id=shared%2Fui",
    ]);
    assert.deepEqual(requests.documents, [
      "/api/doc?path=openspec%2Fspecs%2Fcart%2Fspec.md",
      "/api/doc?path=docs%2Fprds%2Fa%20note.md",
    ]);
  });

  it("asks for both halves of the corpus, since the page fetches the second itself", () => {
    assert.deepEqual(snapshotRequests(store).corpus, [
      "/api/corpus",
      "/api/corpus?archive=1",
    ]);
  });

  // The point of the whole file: the writer files each of these at `snapshotPath`, and
  // the page — or a host standing in for the files — asks with `requestFor`. A request
  // the round trip does not survive is a snapshot with an answer nothing can reach.
  it("names only requests a snapshot can file and read back", () => {
    const requests = Object.values(snapshotRequests(store)).flat();
    assert.ok(requests.length > 0);
    for (const request of requests)
      assert.equal(requestFor(snapshotPath(request)), request);
  });

  it("is empty rather than wrong for a store with nothing in it", () => {
    const empty = snapshotRequests({
      board: { changes: [] },
      catalog: { specs: [] },
      archive: { archive: [] },
      documents: [],
    });
    assert.deepEqual(empty.changes, []);
    assert.deepEqual(empty.validated, []);
    assert.deepEqual(empty.specs, []);
    assert.deepEqual(empty.documents, []);
    // Both halves are still written: the page fetches them before it knows they are
    // empty, and a missing file is the one thing it reads as a broken snapshot.
    assert.equal(empty.corpus.length, 2);
  });
});
