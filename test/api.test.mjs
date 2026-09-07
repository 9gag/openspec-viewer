/**
 * The one entry every answer goes through.
 *
 * `answer()` is what makes a snapshot the same page as the served one: the writer files
 * what it returns, the mounted handler returns it live, and the request handler answers
 * a browser with it. So what is pinned here is the contract the other three lean on —
 * which paths it owns, and what it does with a request it cannot serve — rather than
 * what any one route computes, which is the rest of this suite.
 *
 * Nothing here reads a store. Every case is a request that fails before a route touches
 * disk, which is the part that has to behave the same on a machine with no store at all.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { answer, isApiPath } from "../server/api.mjs";

describe("answer", () => {
  it("throws for a path no route owns", () => {
    assert.throws(() => answer("/api/nothing"), /no route \/api\/nothing/);
    assert.throws(() => answer("/api/board/extra"), /no route/);
    assert.throws(() => answer("/board"), /no route/);
  });

  // The route's own refusal, passed back rather than thrown: the served page renders it,
  // and a snapshot files it, so a reader is told which argument was missing either way.
  it("returns the route's own error for an argument it cannot serve", () => {
    assert.deepEqual(answer("/api/change"), { error: "missing ?id" });
    assert.deepEqual(answer("/api/validate"), { error: "missing ?id" });
    assert.deepEqual(answer("/api/spec"), { error: "missing ?id" });
    assert.deepEqual(answer("/api/doc"), { error: "missing ?path" });
    assert.deepEqual(answer("/api/search"), { error: "missing ?q" });
  });

  it("reads the request as a path and a query, not as a string to match", () => {
    assert.deepEqual(answer("/api/change?other=1"), { error: "missing ?id" });
    assert.deepEqual(answer("/api/doc?path="), { error: "missing ?path" });
  });

  // The writer names its requests by route and argument; a route it names that this
  // does not own would file an answer nothing could produce.
  it("owns every route a snapshot files an answer for", () => {
    for (const request of [
      "/api/change",
      "/api/validate",
      "/api/spec",
      "/api/doc",
    ])
      assert.doesNotThrow(() => answer(request));
  });

  it("agrees with isApiPath about what it answers", () => {
    assert.equal(isApiPath("/api/board"), true);
    assert.equal(isApiPath("/api/corpus"), true);
    assert.equal(isApiPath("/board"), false);
  });
});
