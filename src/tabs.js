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
 * Tabs for the markdown that sits beside the change's spec deltas.
 *
 * A capability directory is not only its spec — a store that writes test cases per
 * capability keeps them next to the requirements they test — and until now the only file
 * in it the page ever opened was spec.md. The rest of the directory was on disk, served
 * by the document route, and reachable only by following a link that happened to cite it.
 *
 * One tab per filename rather than per file. A change deltaing three capabilities carries
 * three test-cases.md, and three tabs all labelled "Test Cases" is a tab bar that names
 * nothing; under one tab they are what the Requirements tab already is, a document per
 * capability. A name the change's own directory already uses is left to that artifact,
 * since the top-level file is the one the tab bar has always meant.
 */
export function capabilityDocTabs(capabilities, artifacts) {
  const taken = new Set(artifacts.map((a) => a.name));
  const tabs = new Map();

  for (const cap of capabilities) {
    for (const doc of cap.docs ?? []) {
      if (taken.has(doc.name)) continue;
      if (!tabs.has(doc.name)) {
        tabs.set(doc.name, {
          name: doc.name,
          label: doc.label,
          kind: "capability-doc",
          docs: [],
        });
      }
      tabs.get(doc.name).docs.push({ ...doc, capability: cap.capability });
    }
  }

  return [...tabs.values()];
}
