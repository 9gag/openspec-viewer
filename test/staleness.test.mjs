/**
 * Staleness is inferred from a file's git history, so the tests build real histories
 * in a throwaway repo and read them back. The inference is the part worth testing:
 * everything it drives — the nudge to unclaim, the "in development" warning — is wrong in a
 * way nobody would notice if the clock started from the wrong commit.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";

import { idleness, parse, snapshots } from "../server/board.mjs";

const CHANGE = "add-guest-checkout";
const DAY = 86_400_000;
let store;

/**
 * A tasks.md with one group, its owner, and `done` of its 3 tasks checked off.
 *
 * `note` varies the task text without touching ownership or any checkbox — that is
 * how the tests commit something real (git refuses an unchanged tree) that must not
 * reset the clock, the way PM rewording a task does not.
 */
const tasksMd = (owner, done, note = "") =>
  [
    `## 1. Payment and order placement${owner ? ` (owner: @${owner})` : ""}`,
    "",
    ...[1, 2, 3].map(
      (n) => `- [${n <= done ? "x" : " "}] 1.${n} Task ${n}${note}`,
    ),
    "",
  ].join("\n");

/** Commit a state at a fixed date, so elapsed time in assertions is exact. */
function commit(owner, done, daysAgo, note = "") {
  const at = new Date(Date.now() - daysAgo * DAY).toISOString();
  writeFileSync(
    join(store, "openspec", "changes", CHANGE, "tasks.md"),
    tasksMd(owner, done, note),
  );
  execFileSync("git", ["add", "-A"], { cwd: store });
  execFileSync("git", ["commit", "-q", "-m", `owner=${owner} done=${done}`], {
    cwd: store,
    env: { ...process.env, GIT_AUTHOR_DATE: at, GIT_COMMITTER_DATE: at },
  });
}

/** Current state + history, the two arguments idleness() takes. */
const read = () => {
  const snaps = snapshots(store, CHANGE);
  const group = parse(
    execFileSync("git", ["show", `HEAD:openspec/changes/${CHANGE}/tasks.md`], {
      cwd: store,
      encoding: "utf8",
    }),
  )[0];
  return { group, snaps };
};

before(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-store-"));
  mkdirSync(join(store, "openspec", "changes", CHANGE), { recursive: true });
  execFileSync("git", ["init", "-q", "-b", "main"], { cwd: store });
  execFileSync("git", ["config", "user.email", "test@example.com"], {
    cwd: store,
  });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: store });
});

after(() => rmSync(store, { recursive: true, force: true }));

describe("idleness", () => {
  it("is null for an unclaimed group, however long it has sat", () => {
    commit(null, 0, 30);
    const { group, snaps } = read();
    assert.equal(group.owner, null);
    assert.equal(idleness(group, snaps, Date.now()), null);
  });

  it("dates from the claim when nothing has been checked off since", () => {
    commit("dana", 0, 20);
    const { group, snaps } = read();
    const idle = idleness(group, snaps, Date.now());
    assert.equal(idle.source, "claim");
    assert.equal(idle.days, 20);
  });

  it("holds the claim date across commits that change nothing about the group", () => {
    commit("dana", 0, 15, " (reworded)"); // PM edited the text; no progress, no handover
    const idle = idleness(...Object.values(read()), Date.now());
    assert.equal(idle.source, "claim");
    assert.equal(
      idle.days,
      20,
      "the clock must not restart on an unrelated commit",
    );
  });

  it("resets to the last checkmark once there is progress", () => {
    commit("dana", 1, 6);
    const idle = idleness(...Object.values(read()), Date.now());
    assert.equal(idle.source, "progress");
    assert.equal(idle.days, 6);
  });

  it("keeps the last checkmark as the clock while it stays the newest event", () => {
    commit("dana", 1, 4, " (reworded again)"); // still 1 of 3 done, still @dana
    const idle = idleness(...Object.values(read()), Date.now());
    assert.equal(idle.source, "progress");
    assert.equal(idle.days, 6);
  });

  it("starts a new stretch when the group changes hands", () => {
    commit(null, 1, 3); // unclaimed
    commit("ravi", 1, 2); // picked up by someone else
    const idle = idleness(...Object.values(read()), Date.now());
    assert.equal(
      idle.source,
      "claim",
      "a newer claim outranks an older checkmark",
    );
    assert.equal(
      idle.days,
      2,
      "the previous owner's history must not count toward @ravi",
    );
  });

  it("is null once every task is checked off", () => {
    commit("ravi", 3, 1);
    const { group, snaps } = read();
    assert.equal(group.owner, "ravi");
    assert.equal(
      idleness(group, snaps, Date.now()),
      null,
      "a finished group is done, not idle",
    );
  });

  it("is null when history cannot account for the current owner", () => {
    // A tag added in the working copy and never committed: the snapshots know nothing
    // about @mei, so there is no honest date to report.
    const snaps = snapshots(store, CHANGE);
    const group = parse(tasksMd("mei", 0))[0];
    assert.equal(idleness(group, snaps, Date.now()), null);
  });

  it("is null with no history at all", () => {
    assert.equal(idleness(parse(tasksMd("dana", 0))[0], [], Date.now()), null);
  });
});
