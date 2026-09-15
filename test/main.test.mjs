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
const clones = [];

/** A fresh git repository, with the few moves these tests make in it. */
function clone() {
  const dir = mkdtempSync(join(tmpdir(), "openspec-viewer-main-"));
  clones.push(dir);
  const git = (args, options = {}) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", ...options }).trim();
  const write = (rel, text) => {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    writeFileSync(join(dir, rel), text);
  };
  const commit = (message) => {
    git(["add", "-A"]);
    git(["commit", "-q", "-m", message]);
  };
  git(["init", "-q", "-b", "main"]);
  git(["config", "user.email", "test@example.com"]);
  git(["config", "user.name", "Test"]);
  return { dir, git, write, commit };
}

after(() => {
  for (const dir of clones) rmSync(dir, { recursive: true, force: true });
});

const tasks = (owner, done = false) =>
  `## 1. Payment${owner ? ` (owner: @${owner})` : ""}\n\n- [${done ? "x" : " "}] 1.1 Take it\n`;

let store;
let git;

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
  let write;
  let commit;
  ({ dir: store, git, write, commit } = clone());
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
    assert.equal(mainOf(clone().dir), null);
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
  /** A checkout on main itself, so anything it reports is what the test did to it. */
  function agreeing() {
    const repo = clone();
    repo.write(`openspec/changes/${CHANGE}/proposal.md`, "# Guest checkout\n");
    repo.write(TASKS, tasks(null));
    repo.write("openspec/changes/wishlist/proposal.md", "# Wishlist\n");
    repo.commit("Add guest checkout and wishlist");
    repo.git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
    return { ...repo, main: mainOf(repo.dir).commit };
  }

  it("names what the checkout lacks or adds, and leaves tasks.md out", () => {
    const { commit: main } = mainOf(store);
    assert.deepEqual(changesDifferingFrom(store, main), [
      "stock-alerts",
      "wishlist",
    ]);

    writeFileSync(
      join(store, "openspec/changes", CHANGE, "proposal.md"),
      "# Guest checkout, edited\n",
    );
    assert.deepEqual(changesDifferingFrom(store, main), [
      CHANGE,
      "stock-alerts",
      "wishlist",
    ]);
  });

  it("names both changes a file moves between", () => {
    const { dir, git, main } = agreeing();
    git([
      "mv",
      `openspec/changes/${CHANGE}/proposal.md`,
      "openspec/changes/wishlist/design.md",
    ]);

    assert.deepEqual(changesDifferingFrom(dir, main), [CHANGE, "wishlist"]);
  });
});
