/**
 * The thresholds decide which claims get called out and in what colour, so they are
 * worth pinning: the store's own fixtures are all fresh, which means nothing in the UI
 * exercises the stale branch on a normal day.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ago, level, QUIET_DAYS, STALE_DAYS } from "../src/time.js";

const idle = (days) => ({ since: 0, days, source: "claim" });

describe("level", () => {
  it("is none without an idle reading, so a missing history is never a nag", () => {
    assert.equal(level(null), "none");
  });

  it("treats a claim that moved recently as fresh", () => {
    assert.equal(level(idle(0)), "fresh");
    assert.equal(level(idle(QUIET_DAYS - 1)), "fresh");
  });

  it("flags the quiet band, inclusive of the threshold", () => {
    assert.equal(level(idle(QUIET_DAYS)), "quiet");
    assert.equal(level(idle(STALE_DAYS - 1)), "quiet");
  });

  it("flags the stale band, inclusive of the threshold", () => {
    assert.equal(level(idle(STALE_DAYS)), "stale");
    assert.equal(level(idle(90)), "stale");
  });
});

describe("ago", () => {
  const now = 1_700_000_000_000;
  const at = (ms) => ago(now - ms, now);

  it("reads as minutes, hours, then days", () => {
    assert.equal(at(10_000), "just now");
    assert.equal(at(10 * 60_000), "10m ago");
    assert.equal(at(3 * 3_600_000), "3h ago");
    assert.equal(at(9 * 86_400_000), "9d ago");
  });

  it("never reports a negative age from a clock skew between machines", () => {
    assert.equal(ago(now + 60_000, now), "just now");
  });
});
