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
