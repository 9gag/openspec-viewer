import { HEADING_KEY, SCENARIO_KEY } from "./toc.js";

/**
 * A string as itself inside a regular expression.
 *
 * A scenario id comes off the wire, and the store chooses it: `cart-SC-[01` is a name a
 * spec is free to write and an unescaped one throws while the page is rendering, which is
 * a blank change rather than a link that missed. The tamer version is a dot, which matches
 * anything and opens the deltas for a scenario the change does not define.
 */
const literal = (text) => String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Which tab a change page opens on.
 *
 * The tabs are the change's own files, and which files a change has is decided by the
 * schema it was created under — so no tab is guaranteed to be there. Reading a change
 * with a ui.md and then opening one without leaves the tab you were on naming nothing;
 * falling back to the first artifact is what keeps that from being a blank page.
 */
export function resolveTab(artifacts, current) {
  if (artifacts.some((a) => a.name === current)) return current;
  return artifacts[0]?.name ?? null;
}

/**
 * The tab bar for a change: the artifacts its schema declares, in the schema's order,
 * then whatever else its spec directories hold.
 *
 * An artifact the schema generates per capability — user journeys, test cases, anything a
 * store files beside the requirements they belong to — is one tab over every capability's
 * copy of that file, and the schema is what decides it is an artifact at all. Matched by
 * filename rather than by id, because a schema names the two independently: the tab is
 * called whatever the schema calls the artifact, and it collects the file that artifact
 * generates.
 *
 * What the schema does not declare is still given a tab. A spec directory can hold
 * anything for the same reason it holds its test cases — the file is about that
 * capability — and those come last, since nothing says where they belong. One tab per
 * filename rather than per file: a change deltaing three capabilities carries three
 * test-cases.md, and three tabs all labelled "Test Cases" is a tab bar that names nothing.
 * A file already claimed by a declared artifact, or a name the change's own directory
 * uses, is left to that artifact.
 */
export function changeTabs(artifacts, capabilities) {
  const copiesOf = (file) =>
    capabilities.flatMap((cap) =>
      (cap.docs ?? [])
        .filter((doc) => doc.file === file)
        .map((doc) => ({ ...doc, capability: cap.capability })),
    );

  const declared = artifacts.map((a) =>
    a.kind === "capability-doc" ? { ...a, docs: copiesOf(a.file) } : a,
  );

  const claimed = new Set(
    declared.filter((a) => a.kind === "capability-doc").map((a) => a.file),
  );
  const named = new Set(declared.map((a) => a.name));

  const rest = new Map();
  for (const cap of capabilities) {
    for (const doc of cap.docs ?? []) {
      if (claimed.has(doc.file) || named.has(doc.name)) continue;
      if (!rest.has(doc.name)) {
        rest.set(doc.name, {
          name: doc.name,
          label: doc.label,
          kind: "capability-doc",
          docs: [],
        });
      }
      rest.get(doc.name).docs.push({ ...doc, capability: cap.capability });
    }
  }

  return [...declared, ...rest.values()];
}

/**
 * The tab an anchor lives on, or null when nothing claims it.
 *
 * A heading's id is `<prefix>--<slug>`, and the prefix says which document it was rendered
 * in: an artifact's own tab prefixes with the tab's name, and a spec prefixes with the
 * capability, since one tab can stack several capabilities' copies of the same document
 * and every spec has a "Purpose".
 *
 * Slugs never contain `--` — they are runs of non-alphanumerics collapsed to one dash — so
 * the first `--` is the boundary, whatever the prefix holds.
 *
 * `prefixes` is what a tab renders under a name that is not its own; the caller knows
 * that, because it is the caller that passes the prefix to the renderer.
 */
export function tabForAnchor(anchor, tabs) {
  const prefix = String(anchor ?? "").split("--")[0];
  if (!prefix) return null;

  const found = tabs.find(
    (tab) => tab.name === prefix || tab.prefixes?.includes(prefix),
  );
  return found?.name ?? null;
}

/**
 * The tab a link asked for, or null when it asked for nothing on this change.
 *
 * The position comes from the route rather than from the address bar: it arrived in the
 * same string as the change id, so the two are read together or the tab is decided against
 * a heading belonging to a page the reader has already left.
 *
 * Two kinds of link land here. `?at=` names a scenario, and only the deltas define
 * scenarios, so it is the specs tab whenever one of this change's capabilities carries
 * that id. `?to=` names a heading, and a heading's anchor is prefixed with the document it
 * was rendered in — which is the tab's own name for an artifact, and the capability for a
 * spec, because one tab stacks several capabilities and every spec has a "Purpose".
 *
 * Without this the link opened the change on its first artifact, with the thing asked for
 * on a tab the reader still had to find and a page that had already given up scrolling —
 * most of the work the link was there to save.
 */
export function tabAsked(data, tabs, position) {
  const heading = position[HEADING_KEY];
  if (heading) {
    // What each tab renders under a name that is not its own. The specs tab prefixes
    // with the capability it is deltaing; a document filed beside a spec does the same,
    // since the tab holds one copy per capability.
    const holding = tabForAnchor(
      heading,
      tabs.map((tab) => ({
        name: tab.name,
        prefixes:
          tab.kind === "specs"
            ? data.capabilities.map((cap) => cap.capability)
            : (tab.docs?.map((doc) => doc.capability) ?? []),
      })),
    );
    if (holding) return holding;
  }

  const scenario = position[SCENARIO_KEY];
  if (!scenario) return null;

  const defines = data.capabilities.some((cap) =>
    new RegExp(
      String.raw`^####\s+Scenario:\s*${literal(scenario)}\b`,
      "im",
    ).test(cap.text ?? ""),
  );

  return defines ? (tabs.find((t) => t.kind === "specs")?.name ?? null) : null;
}
