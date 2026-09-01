/**
 * Which artifacts a change actually has, and the order to read them in.
 *
 * A change is a directory of markdown files, and which files belong there is not fixed:
 * it is decided by the workflow schema the change was created under. `spec-driven`
 * writes proposal / specs / design / tasks, `full-planning` adds a ui.md, and a store
 * can fork its own with whatever else it needs. Two changes in the same store can sit on
 * different schemas.
 *
 * So nothing here names an artifact. The schema says which files a change is supposed to
 * have and in what order they are written; the directory says which of them exist. The
 * change page turns that into its tabs, and the board turns it into coverage.
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { files, openspecJson, read, specDirs } from "./store.mjs";

/**
 * Ordering used only when the schema cannot be read at all — a change directory with no
 * `.openspec.yaml`, or a schema this machine cannot resolve. It decides nothing about
 * *which* tabs exist, only what order the files land in when there is nothing to ask.
 */
const FALLBACK = ["proposal", "specs", "design", "ui", "tasks"];

/** Uppercased whole rather than title-cased, because they are acronyms, not words. */
const ACRONYMS = new Set(["ui", "ux", "api", "qa", "adr", "prd", "faq"]);

/**
 * What this dashboard calls each of OpenSpec's artifacts.
 *
 * The ids are the CLI's and the filenames', and they are the right thing on disk. On a
 * page they name the file rather than what is in it: `proposal` is the product decision,
 * `specs` are the requirements, `design` is the engineering half of the same argument —
 * and the three of them are read by three different people, who each open the one that is
 * theirs. Two of the five are listed unchanged, because the table is the place to read
 * what a name is, and a name missing from it would be a name nobody decided.
 *
 * Ids not in the table keep the general rule below: a schema can name an artifact
 * anything, and a store that adds one gets a readable label rather than nothing.
 */
const COPY = {
  proposal: "Product",
  specs: "Requirements",
  design: "Tech Design",
  ui: "UI",
  tasks: "Tasks",
};

/**
 * A tab label from an artifact id. An id that is already all caps is left alone —
 * `README.md` is a filename people recognise by its shape.
 */
export function label(name) {
  if (COPY[name]) return COPY[name];

  return name
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((word) => {
      if (ACRONYMS.has(word.toLowerCase())) return word.toUpperCase();
      if (word === word.toUpperCase()) return word;
      return word[0].toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * How to render an artifact, from what the schema says it generates.
 *
 * `specs/**` is a directory of capability deltas rather than one document, and tasks.md
 * is a checklist with owners — both are read structurally elsewhere. Everything else is
 * prose, whatever it happens to be called.
 */
const kindOf = (generates) => {
  if (generates.startsWith("specs/")) return "specs";
  if (generates === "tasks.md") return "tasks";
  return "doc";
};

/** The schema a change was created under, from the `.openspec.yaml` the CLI writes beside its artifacts. */
export function schemaName(changeDir) {
  return read(join(changeDir, ".openspec.yaml"))?.match(
    /^schema:\s*["']?([^"'\s]+)/m,
  )?.[1];
}

const schemaCache = new Map();

/**
 * Where a schema's definition lives.
 *
 * A store's own schemas sit in `openspec/schemas/<name>/`; the built-ins ship inside the
 * CLI package, and only the CLI knows where that is on this machine. Looking there first
 * means the common case costs a `existsSync`, and the spawn is paid once per schema for
 * the life of the process.
 */
function readSchema(storePath, name) {
  const local = join(storePath, "openspec", "schemas", name, "schema.yaml");
  if (existsSync(local)) return read(local);
  try {
    const { path } = openspecJson(["schema", "which", name]);
    return read(join(path, "schema.yaml"));
  } catch {
    return null;
  }
}

/**
 * The artifacts a schema declares, in the order it declares them: `[{ id, generates }]`.
 *
 * Read as text rather than parsed as YAML. The two keys wanted are scalars at a known
 * depth, and the rest of the file is pages of folded instruction prose per artifact —
 * the part a real parser would spend all its time on and none of it is needed here.
 */
export function schemaArtifacts(storePath, name) {
  if (!name) return [];
  if (schemaCache.has(name)) return schemaCache.get(name);

  const text = readSchema(storePath, name) ?? "";
  // The `artifacts:` sequence, cut at the next top-level key (`apply:`, `archive:`), so
  // nothing below it is read as an artifact.
  const block = (text.split(/^artifacts:[ \t]*$/m)[1] ?? "").split(/^\S/m)[0];

  const out = [];
  for (const entry of block.split(/\n {2}- /).slice(1)) {
    // Only the scalar head of the entry: the instruction block below it is prose, and
    // prose can contain anything, including lines that look like keys.
    const head = entry.split(/\n {4}(?:instruction|template):/)[0];
    const id = head.match(/(?:^|\n)\s*id:\s*(\S+)/)?.[1];
    const generates = head.match(/(?:^|\n)\s*generates:\s*(\S+)/)?.[1];
    if (!id || !generates) continue;
    out.push({ id, generates: generates.replace(/["']/g, "") });
  }

  schemaCache.set(name, out);
  return out;
}

/**
 * Every artifact this change could have, in schema order, each flagged with whether the
 * file is actually there.
 *
 * Files the schema does not declare are still listed — a change that carries a README.md
 * carries it for a reason, and a viewer that only shows the files it expected is back to
 * hiding half the change. They come last, since nothing says where they belong.
 *
 * Cheap on purpose: two readdirs and a cached schema read, no file bodies and no git.
 * The board calls this for every change on every poll.
 */
export function changeArtifacts(storePath, dir) {
  const base = join(storePath, dir);
  const unclaimed = new Set(files(base));
  const hasSpecs = specDirs(join(base, "specs")).length > 0;

  const declared = schemaArtifacts(storePath, schemaName(base));
  const order = declared.length
    ? declared
    : FALLBACK.map((id) => ({
        id,
        generates: id === "specs" ? "specs/**/*.md" : `${id}.md`,
      }));

  const out = [];
  for (const { id, generates } of order) {
    const kind = kindOf(generates);
    if (kind === "specs") {
      out.push({ name: id, label: label(id), kind, present: hasSpecs });
      continue;
    }
    // `delete` reports whether it was there, and removes it from the leftovers in one go.
    const present = unclaimed.delete(generates);
    out.push({ name: id, label: label(id), kind, file: generates, present });
  }

  for (const file of [...unclaimed].sort()) {
    const name = file.replace(/\.md$/, "");
    out.push({ name, label: label(name), kind: "doc", file, present: true });
  }

  return out;
}
