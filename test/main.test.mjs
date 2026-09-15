/**
 * Claims and checkmarks are commits on the store's main, so the board reads a change's task
 * list and its history there rather than in the checkout, which may sit on a planning
 * branch behind it. These build a clone whose checkout and main disagree, and read both.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { groupsAt, readGroups, snapshots } from "../server/board.mjs";
import {
  changeIdsAt,
  changesDifferingFrom,
  mainOf,
} from "../server/store.mjs";

const CHANGE = "guest-checkout";
const TASKS = `openspec/changes/${CHANGE}/tasks.md`;
let store;

const git = (args, options = {}) =>
  execFileSync("git", args, { cwd: store, encoding: "utf8", ...options }).trim();

function write(rel, text) {
  mkdirSync(dirname(join(store, rel)), { recursive: true });
  writeFileSync(join(store, rel), text);
}

function commit(message) {
  git(["add", "-A"]);
  git(["commit", "-q", "-m", message]);
}

const tasks = (owner, done = false) =>
  `## 1. Payment${owner ? ` (owner: @${owner})` : ""}\n\n- [${done ? "x" : " "}] 1.1 Take it\n`;

/** A commit on origin/main that never touches the checkout, the way a claim lands. */
function recordOnMain(text) {
  const env = { ...process.env, GIT_INDEX_FILE: join(store, ".git", "record") };
  git(["read-tree", "origin/main"], { env });
  const blob = git(["hash-object", "-w", "--stdin"], { input: text });
  git(["update-index", "--cacheinfo", `100644,${blob},${TASKS}`], { env });
  const tree = git(["write-tree"], { env });
  const sha = git(["commit-tree", tree, "-p", "origin/main", "-m", "record"]);
  git(["update-ref", "refs/remotes/origin/main", sha]);
  return sha;
}

before(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-main-"));
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  write(`openspec/changes/${CHANGE}/proposal.md`, "# Guest checkout\n");
  write(TASKS, tasks(null));
  write("openspec/changes/archive/2026-01-01-cart/proposal.md", "# Cart\n");
  commit("Add guest checkout");
  git(["checkout", "-q", "-b", "plan/stock-alerts"]);
  git(["checkout", "-q", "main"]);

  write(TASKS, tasks("dana"));
  commit("Claim guest-checkout group 1 for @dana");
  write("openspec/changes/wishlist/proposal.md", "# Wishlist\n");
  commit("Add wishlist");
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);

  git(["checkout", "-q", "plan/stock-alerts"]);
  write("openspec/changes/stock-alerts/proposal.md", "# Stock alerts\n");
});

after(() => rmSync(store, { recursive: true, force: true }));

describe("mainOf", () => {
  it("names origin/main and the commit it points at", () => {
    assert.deepEqual(mainOf(store), {
      ref: "origin/main",
      commit: git(["rev-parse", "origin/main"]),
    });
  });

  it("follows origin/HEAD, since which branch is main is the store's decision", () => {
    git(["update-ref", "refs/remotes/origin/trunk", "origin/main"]);
    git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/trunk"]);
    try {
      assert.equal(mainOf(store).ref, "origin/trunk");
    } finally {
      git(["symbolic-ref", "--delete", "refs/remotes/origin/HEAD"]);
      git(["update-ref", "-d", "refs/remotes/origin/trunk"]);
    }
  });

  it("is null for a clone with no main to read", () => {
    const bare = mkdtempSync(join(tmpdir(), "openspec-viewer-nomain-"));
    try {
      execFileSync("git", ["init", "-q", "-b", "main"], { cwd: bare });
      assert.equal(mainOf(bare), null);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});

describe("reading the plan at main", () => {
  it("lists the changes in development on main, not the checkout's", () => {
    assert.deepEqual(changeIdsAt(store, mainOf(store).commit), [
      CHANGE,
      "wishlist",
    ]);
  });

  it("reads a claim on main that the checkout has not seen", () => {
    const { commit: main } = mainOf(store);
    assert.equal(groupsAt(store, main, CHANGE)[0].owner, "dana");
    assert.equal(readGroups(store, CHANGE)[0].owner, null);
    assert.equal(snapshots(store, CHANGE, main)[0].groups.get("1").owner, "dana");
  });

  it("is null for a change with no tasks.md on main", () => {
    assert.equal(groupsAt(store, mainOf(store).commit, "wishlist"), null);
  });

  it("re-reads the history once main moves, though HEAD has not", () => {
    const before = snapshots(store, CHANGE, mainOf(store).commit);
    const moved = recordOnMain(tasks("dana", true));
    const after = snapshots(store, CHANGE, moved);

    assert.notEqual(before, after);
    assert.equal(after.length, before.length + 1);
    assert.equal(after[0].groups.get("1").tasks[0].done, true);
  });
});

describe("changesDifferingFrom", () => {
  it("names what the checkout lacks or adds, and leaves tasks.md out", () => {
    const { commit: main } = mainOf(store);
    assert.deepEqual(changesDifferingFrom(store, main), [
      "stock-alerts",
      "wishlist",
    ]);

    write(`openspec/changes/${CHANGE}/proposal.md`, "# Guest checkout, edited\n");
    assert.deepEqual(changesDifferingFrom(store, main), [
      CHANGE,
      "stock-alerts",
      "wishlist",
    ]);
  });
});
