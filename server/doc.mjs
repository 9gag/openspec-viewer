/**
 * Markdown in the store that is not an OpenSpec artifact.
 *
 * Specs cite their PRDs and the governance docs cite each other, always with a link
 * relative to the file it sits in. Every one of those was a dead end: the routes here
 * covered `openspec/` and nothing else, so there was no address a PRD could have. The
 * page being hash-routed made the failure look stranger than it was — the browser
 * resolved `../../../docs/prds/x.md` against the server root and asked for a path no
 * route owned, and the server answered the only way it could.
 *
 * So: any markdown file in the store, addressed by its store-relative path. Artifacts
 * under `openspec/` are reachable through this too, which is what makes a spec that
 * links a sibling spec's file work without a second rule.
 */

import { isAbsolute, relative, resolve, sep } from "node:path";

import { lastCommit, read, resolveRoot } from "./store.mjs";

/**
 * A requested path resolved inside the store, or null when it does not belong to one.
 *
 * The path arrives from a link inside a document the store happens to contain, which is
 * to say from data, so this is the boundary that decides whether `../../../.ssh/id_rsa`
 * is a document. Three rules and a path has to pass all of them: it is not absolute to
 * begin with, it is markdown, and it is still inside the store root once `..` segments
 * have been applied.
 *
 * Kept separate from `doc` and exported so the confinement can be tested without a
 * store to resolve — the rule is the part worth pinning, and `resolveRoot` shells out
 * to the CLI.
 */
export function storeRelative(root, requested) {
  if (!requested || isAbsolute(requested)) return null;
  // Markdown only. Everything the viewer can render is markdown, and widening this to
  // "any file in the store" would turn a document reader into a file server for a
  // directory that also holds a git checkout.
  if (!requested.toLowerCase().endsWith(".md")) return null;

  const abs = resolve(root, requested);
  const inside = relative(root, abs);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`)) return null;
  if (isAbsolute(inside)) return null;

  // Normalized on the way out, so `docs/./prds/x.md` and `docs/prds/x.md` name one
  // document rather than two spellings of a route. Slashes regardless of platform:
  // this is a URL segment, not a path the browser will ever hand back to the OS.
  return { abs, rel: inside.split(sep).join("/") };
}

/**
 * One markdown document from the store: its text, where it lives, and when it last
 * changed. Null when the path is not one the store will answer for, or when nothing is
 * there to read — the route turns either into the same 404, because to a reader they
 * are the same thing.
 */
export function doc(requested) {
  const root = resolveRoot();
  const found = storeRelative(root.path, requested);
  if (!found) return null;

  const text = read(found.abs);
  if (text === null) return null;

  return {
    path: found.rel,
    text,
    // The heading rather than the filename, when the document has one: it is what the
    // link that brought the reader here called it.
    title: text.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? found.rel,
    commit: lastCommit(root.path, found.rel),
  };
}
