/**
 * Every component a view renders is a component that view can name.
 *
 * A JSX tag referring to nothing is invisible to everything this project runs: the bundler
 * emits it happily, the tests do not mount a view, and the page throws
 * `ReferenceError: X is not defined` on first render — a blank screen and a stack trace in
 * a console nobody has open. That is exactly how a `<ResolvedIds>` wrapper shipped with its
 * import missing, through a green build and a green suite.
 *
 * So: the tags a file uses, against the names it has. Nothing about correctness, only that
 * the name exists — which is the whole of the failure this prevents.
 */

import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const src = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

/** Every .jsx under src/, however deep. */
function views(dir = src, prefix = "src") {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory())
      out.push(...views(path, `${prefix}/${entry.name}`));
    else if (entry.name.endsWith(".jsx"))
      out.push({
        name: `${prefix}/${entry.name}`,
        text: readFileSync(path, "utf8"),
      });
  }
  return out;
}

/**
 * Comments removed, because this file's own kind of comment talks about components in
 * prose — "`<Theme>` lives inside App rather than here" is a sentence, not a render.
 */
const code = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/**
 * The capitalised tags a file opens. Lowercase tags are HTML, and the part before a dot is
 * the name that has to resolve — `<Foo.Bar>` needs `Foo`.
 */
const tagsIn = (text) =>
  new Set(
    [...code(text).matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>.]/g)].map((m) => m[1]),
  );

/**
 * The names a file has: everything it imports, and everything it declares at any depth.
 * Deliberately generous — a name that exists is the bar, and a false pass here is a
 * component that would have worked anyway.
 */
function namesIn(text) {
  const names = new Set();

  for (const match of text.matchAll(
    /import\s+([\s\S]*?)\s+from\s+["'][^"']+["']/g,
  )) {
    for (const part of match[1].replace(/[{}]/g, ",").split(",")) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
        ?.trim();
      if (name && name !== "*") names.add(name);
    }
  }

  for (const match of text.matchAll(
    /(?:function|class)\s+([A-Za-z0-9_$]+)|(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=/g,
  )) {
    names.add(match[1] ?? match[2]);
  }

  return names;
}

describe("every JSX tag names something", () => {
  for (const view of views()) {
    it(view.name, () => {
      const names = namesIn(view.text);
      const missing = [...tagsIn(view.text)].filter((tag) => !names.has(tag));
      assert.deepEqual(
        missing,
        [],
        `${view.name} renders ${missing.join(", ")} without importing or defining it`,
      );
    });
  }
});
