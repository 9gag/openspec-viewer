/**
 * Locating the store and talking to git. Shared by every reader in this directory.
 *
 * The store path is never hardcoded and never derived from this package's own location:
 * it comes from `openspec list --json` run in the directory the viewer was started from.
 * That one rule covers both ways this tool is used. Started in a repo that points at a
 * store — `store: <id>` in its openspec/config.yaml — the CLI maps the id through the
 * per-machine registry and returns that clone. Started inside a store, the CLI resolves
 * the root as the repo itself. Either way the viewer and the CLI cannot disagree about
 * which store they are looking at, because only one of them is doing the resolving.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, sep } from "node:path";

/**
 * Where to run the CLI. `OPENSPEC_VIEWER_CWD` is for the case where the process cannot
 * be started in the right directory — a wrapper script, an editor task — and is not
 * needed otherwise.
 */
export const ORIGIN = resolve(process.env.OPENSPEC_VIEWER_CWD ?? process.cwd());

// The CLI is usually a global install rather than a dependency of the repo being read,
// so PATH is the normal case. A copy in that repo's own node_modules wins when one is
// there: a package manager puts only the running package's bin directory on PATH, which
// under pnpm is this package's, not the consumer's.
const LOCAL_BIN = join(ORIGIN, "node_modules", ".bin", "openspec");
const OPENSPEC = existsSync(LOCAL_BIN) ? LOCAL_BIN : "openspec";

/**
 * How the reader talks back to the store. The board prints claim, unclaim and sync
 * commands rather than running them, and a command that has to be edited before it will
 * run is barely better than no command — so a repo that wraps the CLI says so here:
 *
 *   OPENSPEC_VIEWER_CLI="pnpm plan" openspec-viewer
 *
 * The default is the CLI itself, which is correct wherever there is no wrapper.
 */
export const CLI = process.env.OPENSPEC_VIEWER_CLI?.trim() || "openspec";

/**
 * The resolved store, cached for the life of the process.
 *
 * Spawning the openspec CLI costs about two seconds, and every request needs the store
 * path, so calling it per request made the board slower than its own poll interval.
 * What the CLI resolves — a store id to a path, through the per-machine registry — does
 * not change while the server runs; restart it after `openspec store register`.
 *
 * Everything that *does* change while the server runs (which changes exist, their
 * contents, their history) is read from disk and git on every request.
 */
let rootCache = null;

export function resolveRoot() {
  if (!rootCache) rootCache = openspecJson(["list"]).root;
  return rootCache;
}

/** Changes in development, from disk — the archive is not one of them. */
export function changeIds(storePath) {
  return dirs(join(storePath, "openspec", "changes")).filter(
    (name) => name !== "archive",
  );
}

/** Run an openspec command from the origin directory and parse its JSON. Throws on failure. */
export function openspecJson(args) {
  const out = execFileSync(OPENSPEC, [...args, "--json"], {
    cwd: ORIGIN,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  // Some commands print a "Using OpenSpec root:" banner before the JSON.
  return JSON.parse(out.slice(out.indexOf("{")));
}

/** Run an openspec command for its exit code and output. Never throws. */
export function openspecText(args) {
  try {
    const out = execFileSync(OPENSPEC, args, {
      cwd: ORIGIN,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true, out };
  } catch (err) {
    return {
      ok: false,
      out: `${err.stdout ?? ""}${err.stderr ?? ""}`.trim() || err.message,
    };
  }
}

export function git(cwd, args) {
  try {
    return execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export const read = (abs) =>
  existsSync(abs) ? readFileSync(abs, "utf8") : null;

export function dirs(abs) {
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort();
}

/**
 * Capability directories under a specs root, as `/`-joined relative paths.
 *
 * A capability is any directory holding a `spec.md`, however deep: stores group specs
 * by product (`specs/<product>/<capability>/spec.md`), and a flat store is just the
 * zero-groups case. Listing first-level directories instead would present a product as
 * an empty capability and hide everything inside it.
 */
export function specDirs(abs, prefix = "") {
  const out = [];
  for (const name of dirs(abs)) {
    const rel = prefix ? `${prefix}/${name}` : name;
    if (existsSync(join(abs, name, "spec.md"))) out.push(rel);
    else out.push(...specDirs(join(abs, name), rel));
  }
  return out;
}

export function files(abs, ext = ".md") {
  if (!existsSync(abs)) return [];
  return readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(ext))
    .map((e) => e.name)
    .sort();
}

/** Sync state of the store clone: branch, uncommitted files, and drift from its remote. */
export function storeStatus(root) {
  const path = root.path;
  // `cli` rides along with the store rather than in its own endpoint: every place the
  // page prints a command is a place that already has the store in hand.
  const status = { id: root.store_id ?? null, path, cli: CLI, git: false };
  if (git(path, ["rev-parse", "--git-dir"]) === null) return status;

  status.git = true;
  status.branch = git(path, ["rev-parse", "--abbrev-ref", "HEAD"]);
  status.dirty = (git(path, ["status", "--porcelain"]) || "")
    .split("\n")
    .filter(Boolean).length;

  // No fetch. Polling while shelling out to the network would hammer the remote, so
  // this reports drift as of the last fetch somebody else did.
  status.upstream = git(path, [
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  ]);
  if (status.upstream) {
    const counts = git(path, [
      "rev-list",
      "--left-right",
      "--count",
      `${status.upstream}...HEAD`,
    ]);
    const [behind, ahead] = (counts || "0\t0").split(/\s+/).map(Number);
    status.behind = behind;
    status.ahead = ahead;
  }
  return status;
}

/** One built index per store, keyed by the HEAD it was built from. */
const indexCache = new Map();

/**
 * What HEAD points at, read from the filesystem rather than from `git rev-parse`.
 *
 * This is the index's cache key, so it is checked on every lookup — and a spawn per
 * lookup is the cost this whole file is trying to stop paying. Three small file reads
 * answer it: `.git/HEAD`, and the ref it names either loose or in `packed-refs`.
 *
 * Null when there is nothing to read, which is a store that is not a git checkout —
 * indistinguishable, here, from one whose history says nothing, and handled the same
 * way by everything downstream.
 */
function headSignature(storePath) {
  let gitDir = join(storePath, ".git");
  // A file rather than a directory in a worktree or a submodule, naming the real one.
  if (existsSync(gitDir) && statSync(gitDir).isFile()) {
    const named = read(gitDir)
      ?.match(/^gitdir:\s*(.+)$/m)?.[1]
      ?.trim();
    if (!named) return null;
    gitDir = resolve(storePath, named);
  }

  const head = read(join(gitDir, "HEAD"))?.trim();
  if (!head) return null;
  if (!head.startsWith("ref: ")) return head; // detached: HEAD is the sha

  const ref = head.slice(5).trim();
  const loose = read(join(gitDir, ref))?.trim();
  if (loose) return `${ref} ${loose}`;

  // A ref with no file of its own has been packed — or does not exist yet, which is a
  // branch with no commits on it and an index that will come back empty either way.
  const packed = (read(join(gitDir, "packed-refs")) ?? "")
    .split("\n")
    .find((line) => line.endsWith(` ${ref}`));
  return `${ref} ${packed?.split(" ")[0] ?? "unborn"}`;
}

/**
 * Every path's newest commit, from one walk of the history.
 *
 * `lastCommit` used to be a `git log -1 -- <path>` per path, which reads fine until you
 * count the callers: the catalogue asks for every change, every archived change and
 * every shipped spec, so a store with a hundred of those paid a hundred process spawns
 * for a request. Git answers each one in about ten milliseconds and node spends longer
 * than that starting the process — the cost was never the query.
 *
 * So the whole history is walked once — 85ms on a store of a thousand commits — and
 * indexed by path. Newest first, first write wins, and every ancestor directory is
 * indexed alongside the file, because half the callers ask about a change's directory
 * rather than a file in it.
 *
 * Rebuilt when HEAD moves. Nothing else can change what git log says, and the working
 * tree deliberately does not: an uncommitted file has no commit under either
 * implementation.
 */
function commitIndex(storePath) {
  const head = headSignature(storePath);
  const hit = indexCache.get(storePath);
  if (hit && hit.head === head) return hit.paths;

  const paths = new Map();
  // NUL between records so a commit subject cannot be mistaken for a filename, and no
  // pathspec: limiting the walk to `openspec/` would cost a second walk the first time
  // a spec links a PRD outside it.
  //
  // `-c` is what keeps this agreeing with the `git log -1 -- <path>` it replaced. A
  // merge lists no filenames without it, so a conflict resolved by hand — the one kind
  // of merge that is the newest thing to touch a file — would be credited to whichever
  // commit came before it. Under `-c` a merge lists exactly the files that differ from
  // every parent, which is git's own rule for showing a merge against a path, so clean
  // merges still list nothing.
  const log = head
    ? git(storePath, [
        "log",
        "-c",
        "--name-only",
        "--format=%x00%H%x1f%ct%x1f%s",
      ])
    : null;

  for (const record of (log ?? "").split("\0")) {
    const [header, ...names] = record.split("\n");
    if (!header) continue;
    const [sha, when, subject] = header.split("\x1f");
    const commit = {
      sha: sha.slice(0, 8),
      at: Number(when) * 1000,
      subject,
    };
    for (const name of names) {
      if (!name) continue;
      // The file, then every directory above it. `set` only when absent: the walk is
      // newest-first, so whatever is already there happened later.
      for (let at = name.length; at > 0; at = name.lastIndexOf("/", at - 1)) {
        const path = name.slice(0, at);
        if (paths.has(path)) break; // its ancestors are indexed too
        paths.set(path, commit);
      }
    }
  }

  indexCache.set(storePath, { head, paths });
  return paths;
}

/** When a path in the store last changed, and in which commit. */
export function lastCommit(storePath, rel) {
  return commitIndex(storePath).get(rel.split(sep).join("/")) ?? null;
}

/**
 * The contents of several blobs, as `<commit>:<path>` refs, in one `git cat-file`
 * rather than a `git show` each. Same reason as the commit index: the board reads one
 * snapshot per commit that ever touched a change's tasks.md, and on a busy store that
 * was a hundred and sixty spawns a poll.
 *
 * Missing refs come back null rather than throwing — a commit that deleted or renamed
 * the file is a normal entry in that list, not an error.
 */
export function catFile(storePath, refs) {
  const out = new Map(refs.map((ref) => [ref, null]));
  if (refs.length === 0) return out;

  let buf;
  try {
    buf = execFileSync("git", ["cat-file", "--batch"], {
      cwd: storePath,
      input: `${refs.join("\n")}\n`,
      // No `encoding`, so this comes back as a Buffer: the record header gives a length
      // in bytes, and a decoded string would count a multi-byte character once and read
      // the next header from the wrong offset.
      maxBuffer: 256 * 1024 * 1024,
      stdio: ["pipe", "pipe", "ignore"],
    });
  } catch {
    return out;
  }

  // One record per requested ref, in the order asked: either `<oid> <type> <size>` and
  // that many bytes of content, or `<ref> missing` and nothing.
  let at = 0;
  for (const ref of refs) {
    const eol = buf.indexOf(10, at);
    if (eol === -1) break;
    const header = buf.toString("utf8", at, eol);
    at = eol + 1;
    const size = Number(header.split(" ")[2]);
    if (!Number.isInteger(size)) continue; // missing, or ambiguous
    out.set(ref, buf.toString("utf8", at, at + size));
    at += size + 1; // git writes a newline after the content
  }

  return out;
}
