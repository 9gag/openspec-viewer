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

import { files, lastCommit, openspecJson, read, specDirs } from "./store.mjs";

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
 * The markdown that sits beside a capability's spec.md.
 *
 * A capability directory is not only its spec. A store that writes test cases per
 * capability keeps them next to the requirements they test, and can keep anything else
 * there for the same reason — the file is about that capability, so it lives with it.
 * None of it is declared anywhere: a schema names the artifacts a *change* generates,
 * and says nothing about what a spec directory holds. So this is the directory listing
 * and nothing else, which is the same rule `changeArtifacts` already applies to the
 * files a change carries that its schema never asked for.
 *
 * Listing only, no bodies. The board reads every change's capabilities on every poll,
 * and the two pages that render these documents ask for the text themselves.
 */
export function capabilityDocs(abs, rel) {
  return files(abs)
    .filter((name) => name !== "spec.md")
    .map((file) => {
      const name = file.replace(/\.md$/, "");
      return { name, label: label(name), file, path: `${rel}/${file}` };
    });
}

/** The same list with each document's text and history, for the page that renders it. */
export function readDocs(storePath, docs) {
  return docs.map((doc) => ({
    ...doc,
    text: read(join(storePath, doc.path)),
    commit: lastCommit(storePath, doc.path),
  }));
}

/**
 * The file a `specs/` glob asks for inside each capability directory, or null when the
 * artifact is the deltas themselves.
 *
 * A schema does not only generate the specs. A store that writes user journeys or test
 * cases per capability declares each of them the same way, as a glob over the same
 * directories — they are separate artifacts of the change, written by different hands and
 * read on their own, not part of the delta. The filename at the end of the glob is what
 * tells the two apart: `spec.md`, or a wildcard standing in for it, is the delta; anything
 * else is a document filed beside it, one per capability.
 */
function capabilityFile(generates) {
  if (!generates.startsWith("specs/")) return null;
  const file = generates.split("/").pop();
  return file === "spec.md" || file.includes("*") ? null : file;
}

/**
 * Which of a change's capabilities actually carry one of those documents, as paths
 * relative to the change directory.
 */
const capabilityPaths = (base, caps, file) =>
  caps
    .map((cap) => `specs/${cap}/${file}`)
    .filter((rel) => existsSync(join(base, rel)));

/**
 * How to render an artifact, from what the schema says it generates.
 *
 * A glob over the spec directories is either the capability deltas — a directory of specs
 * rather than one document — or a document filed beside each of them; tasks.md is a
 * checklist with owners. All three are read structurally elsewhere. Everything else is
 * prose, whatever it happens to be called.
 */
const kindOf = (generates) => {
  if (capabilityFile(generates)) return "capability-doc";
  if (generates.startsWith("specs/")) return "specs";
  if (generates === "tasks.md") return "tasks";
  return "doc";
};

/** The schema a change records for itself, in the `.openspec.yaml` the CLI writes beside its artifacts. */
export function schemaName(changeDir) {
  return read(join(changeDir, ".openspec.yaml"))?.match(
    /^schema:\s*["']?([^"'\s]+)/m,
  )?.[1];
}

/**
 * The schema a change gets when it records none of its own: the store's, from its
 * `openspec/config.yaml`.
 *
 * Not the CLI's built-in default, which is a different schema — a store that configures
 * `full-planning` and a change created before the CLI started writing `.openspec.yaml`
 * expects five artifacts, and guessing at the built-in would have reported a ui.md that
 * schema never asked for as missing. Anchored at column zero so the `context:` block
 * below it, which is prose and can contain anything, cannot answer this.
 */
function storeSchema(storePath) {
  return read(join(storePath, "openspec", "config.yaml"))?.match(
    /^schema:\s*["']?([^"'\s]+)/m,
  )?.[1];
}

/** The schema this change is read under: its own if it records one, else the store's. */
export const schemaFor = (storePath, changeDir) =>
  schemaName(changeDir) ?? storeSchema(storePath);

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
  const caps = specDirs(join(base, "specs"));

  const declared = schemaArtifacts(storePath, schemaFor(storePath, base));
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
      out.push({ name: id, label: label(id), kind, present: caps.length > 0 });
      continue;
    }
    // One file per capability rather than one on the change, so `file` is the bare
    // filename to look for in each spec directory — the reader gathers the copies.
    if (kind === "capability-doc") {
      const file = capabilityFile(generates);
      out.push({
        name: id,
        label: label(id),
        kind,
        file,
        present: capabilityPaths(base, caps, file).length > 0,
      });
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

/**
 * Which of the artifacts the schema asked for exist, and where.
 *
 * The same question `changeArtifacts` answers for the tabs, told the other way round:
 * tabs are the files that are there, completeness is the schema's list with a yes or no
 * against each. Both come from one read of the schema, so they cannot disagree about what
 * a change was supposed to have.
 *
 * This used to be `openspec status --change <id>`, which is authoritative and takes about
 * a second — paid on the first view of every change page, which is most views of it. What
 * it reports is the schema's `generates` for each artifact and which files match it, and
 * both halves were already in hand: the schema is read here anyway to build the tabs, and
 * matching it is a directory listing. Checked against the CLI's answer for every change
 * in a real store before the call came out, which is what turned up the fallback below.
 *
 * Null when the schema cannot be read at all, which is the one case the local answer is
 * not equivalent: `changeArtifacts` falls back to a conventional list so the tabs still
 * open the files that exist, but a *missing* artifact from a list nobody declared is an
 * expectation this tool invented. The card is absent rather than wrong.
 */
export function completeness(storePath, dir) {
  const base = join(storePath, dir);
  const declared = schemaArtifacts(storePath, schemaFor(storePath, base));
  if (!declared.length) return null;

  const here = files(base);
  const caps = specDirs(join(base, "specs"));
  return declared.map(({ id, generates }) => {
    const file = capabilityFile(generates);
    const paths = file
      ? capabilityPaths(base, caps, file)
      : kindOf(generates) === "specs"
        ? caps.map((cap) => `specs/${cap}/spec.md`)
        : here.includes(generates)
          ? [generates]
          : [];
    return { name: id, expected: generates, present: paths.length > 0, paths };
  });
}
