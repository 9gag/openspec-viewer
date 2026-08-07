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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

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

/** Changes in flight, from disk — the archive is not one of them. */
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

/** When a path in the store last changed, and in which commit. */
export function lastCommit(storePath, rel) {
  const out = git(storePath, [
    "log",
    "-1",
    "--format=%H%x1f%ct%x1f%s",
    "--",
    rel,
  ]);
  if (!out) return null;
  const [sha, when, subject] = out.split("\x1f");
  return { sha: sha.slice(0, 8), at: Number(when) * 1000, subject };
}
