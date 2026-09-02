/**
 * The commit index and the blob batch: one walk of the history answering what used to
 * be a `git log -1` per path, and one `git cat-file` answering what used to be a
 * `git show` per commit.
 *
 * Both are a cache in front of git, and a cache is only worth having if it says what
 * the thing it replaced said. So these build real histories — an ordinary edit, a
 * directory, a rename, a merge that resolved a conflict — and check each answer against
 * `git log -1 -- <path>` itself rather than against a value written down here.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, before, describe, it } from "node:test";

import { catFile, lastCommit } from "../server/store.mjs";

let store;

const git = (...args) =>
  execFileSync("git", args, { cwd: store, encoding: "utf8" }).trim();

/** Untrimmed, for the file contents a blob comparison has to match byte for byte. */
const gitRaw = (...args) =>
  execFileSync("git", args, { cwd: store, encoding: "utf8" });

/** Write a file and commit it, one commit per call so every path has its own. */
function commit(path, text, message = `write ${path}`) {
  const abs = join(store, path);
  mkdirSync(dirname(abs), { recursive: true });
  writeFileSync(abs, text);
  git("add", "-A");
  git("commit", "-q", "-m", message);
  return git("rev-parse", "HEAD");
}

/** What the per-path `git log -1` this index replaced would have answered. */
const viaGitLog = (path) => {
  const out = git("log", "-1", "--format=%H%x1f%ct%x1f%s", "--", path);
  if (!out) return null;
  const [sha, ...rest] = out.split("\x1f");
  return [sha.slice(0, 8), ...rest].join("\x1f");
};

/** The same fields, from the index, in the same shape. */
const viaIndex = (path) => {
  const found = lastCommit(store, path);
  return found
    ? [found.sha, found.at / 1000, found.subject].join("\x1f")
    : null;
};

before(() => {
  store = mkdtempSync(join(tmpdir(), "openspec-viewer-history-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");

  commit("openspec/specs/checkout/spec.md", "# checkout\n");
  commit("openspec/specs/pricing/spec.md", "# pricing\n");
  commit("openspec/changes/add-guest-checkout/proposal.md", "# why\n");
  commit(
    "openspec/specs/checkout/spec.md",
    "# checkout\n\nmore\n",
    "edit checkout",
  );
  commit("docs/prds/checkout.md", "# prd\n");
});

after(() => rmSync(store, { recursive: true, force: true }));

describe("lastCommit", () => {
  it("dates a file from the newest commit that touched it, not the newest commit", () => {
    assert.equal(
      viaIndex("openspec/specs/checkout/spec.md"),
      viaGitLog("openspec/specs/checkout/spec.md"),
    );
    // The one nothing has touched since it arrived, four commits back.
    assert.equal(
      viaIndex("openspec/specs/pricing/spec.md"),
      viaGitLog("openspec/specs/pricing/spec.md"),
    );
  });

  it("dates a directory from the newest commit under it", () => {
    // Half the callers ask about a change's directory rather than a file in it.
    for (const dir of [
      "openspec/specs/checkout",
      "openspec/specs",
      "openspec",
      "docs/prds",
    ])
      assert.equal(viaIndex(dir), viaGitLog(dir), dir);
  });

  it("reads paths outside openspec/, which is where a spec's PRD links land", () => {
    assert.equal(
      viaIndex("docs/prds/checkout.md"),
      viaGitLog("docs/prds/checkout.md"),
    );
  });

  it("is null for a path git has never seen", () => {
    assert.equal(lastCommit(store, "openspec/specs/nothing/spec.md"), null);
  });

  it("sees a commit made after it was first read", () => {
    const before = viaIndex("openspec/specs/pricing/spec.md");
    commit(
      "openspec/specs/pricing/spec.md",
      "# pricing\n\nmore\n",
      "edit pricing",
    );
    const after = viaIndex("openspec/specs/pricing/spec.md");
    assert.notEqual(after, before);
    assert.equal(after, viaGitLog("openspec/specs/pricing/spec.md"));
  });

  it("follows a rename to where the file is now", () => {
    // How a change reaches the archive: the whole directory moves in one commit.
    mkdirSync(join(store, "openspec", "changes", "archive"), {
      recursive: true,
    });
    git(
      "mv",
      "openspec/changes/add-guest-checkout",
      "openspec/changes/archive/2026-01-01-add-guest-checkout",
    );
    git("commit", "-q", "-m", "archive add-guest-checkout");
    const moved = "openspec/changes/archive/2026-01-01-add-guest-checkout";
    assert.equal(viaIndex(moved), viaGitLog(moved));
    assert.equal(
      lastCommit(store, moved).subject,
      "archive add-guest-checkout",
    );
  });

  it("credits a merge that resolved a conflict, the way git log does", () => {
    // A merge lists no filenames in a plain --name-only walk, so without asking git for
    // the combined diff this would date the file from whatever came before the merge.
    commit(
      "openspec/specs/checkout/spec.md",
      "# checkout\n\nmain\n",
      "edit on main",
    );
    git("checkout", "-q", "-b", "side", "HEAD~1");
    commit(
      "openspec/specs/checkout/spec.md",
      "# checkout\n\nside\n",
      "edit on side",
    );
    git("checkout", "-q", "main");
    try {
      git("merge", "side", "-m", "merge side");
    } catch {
      // Expected: the conflict is the point.
    }
    writeFileSync(
      join(store, "openspec/specs/checkout/spec.md"),
      "# checkout\n\nresolved\n",
    );
    git("add", "-A");
    git("commit", "-q", "-m", "merge side");

    const rel = "openspec/specs/checkout/spec.md";
    assert.equal(viaIndex(rel), viaGitLog(rel));
    assert.equal(lastCommit(store, rel).subject, "merge side");
  });
});

describe("catFile", () => {
  it("reads every version of a file in one call", () => {
    const rel = "openspec/specs/pricing/spec.md";
    const shas = git("log", "--format=%H", "--", rel).split("\n");
    const refs = shas.map((sha) => `${sha}:${rel}`);
    const got = catFile(store, refs);

    assert.equal(got.size, refs.length);
    for (const ref of refs)
      assert.equal(got.get(ref), gitRaw("show", ref), ref);
  });

  it("gives null for a ref that is not there, rather than throwing", () => {
    // The commit that deleted or renamed the file is a normal entry in that list.
    const head = git("rev-parse", "HEAD");
    const got = catFile(store, [
      `${head}:openspec/specs/gone/spec.md`,
      `${head}:openspec/specs/pricing/spec.md`,
    ]);
    assert.equal(got.get(`${head}:openspec/specs/gone/spec.md`), null);
    assert.equal(
      typeof got.get(`${head}:openspec/specs/pricing/spec.md`),
      "string",
    );
  });

  it("keeps multi-byte content aligned across records", () => {
    // The batch header counts bytes; a record read as characters would take the next
    // header from the wrong offset and every ref after it would come back wrong.
    const wide = commit(
      "openspec/specs/pricing/spec.md",
      "# pricing\n\n— ✅ 日本語\n",
      "widen pricing",
    );
    const rel = "openspec/specs/pricing/spec.md";
    const refs = [`${wide}:${rel}`, `${wide}:openspec/specs/checkout/spec.md`];
    const got = catFile(store, refs);
    assert.equal(got.get(refs[0]), "# pricing\n\n— ✅ 日本語\n");
    assert.equal(got.get(refs[1]), gitRaw("show", refs[1]));
  });

  it("asks git nothing when there is nothing to ask about", () => {
    assert.deepEqual([...catFile(store, [])], []);
  });
});
