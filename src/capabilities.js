/**
 * The namespace rule, and the two lists arranged by it: the catalog, and the in-development
 * changes in the nav. Kept out of the views so the ordering can be tested.
 *
 * OpenSpec writes the grouping into the capability path itself — `shared-ui/cart`,
 * `checkout/guest-checkout` — and both lists used to sort it away into one
 * alphabetical run. On a store of fifty-odd capabilities that run is the page.
 */

/** Where capabilities with no namespace of their own are collected. */
export const TOP_LEVEL = "top level";

/**
 * Everything before the last slash, so a nested capability keeps every level of its
 * namespace rather than only the first. Null for a capability that has none.
 */
export function namespaceOf(capability) {
  const cut = capability.lastIndexOf("/");
  return cut === -1 ? null : capability.slice(0, cut);
}

/** The part of the path the namespace heading does not already say. */
export function leafOf(capability) {
  const cut = capability.lastIndexOf("/");
  return cut === -1 ? capability : capability.slice(cut + 1);
}

/**
 * What the store holds, in one line above the list.
 *
 * Zero is omitted rather than shown, so the line only ever names states the store is
 * actually in — "0 retired" on a store that has never removed a capability is a word
 * about nothing, and the reader has to check every count to find the ones that matter.
 */
export function summarise(caps) {
  const inState = (state) => caps.filter((c) => c.state === state).length;

  return {
    total: caps.length,
    shipped: inState("shipped"),
    unshipped: inState("unshipped"),
    retired: inState("retired"),
    // Two in-development changes on one capability: the collision the board counts, named here
    // against the capability it will break.
    contested: caps.filter((c) => c.inDevelopment > 1).length,
  };
}

/** A change that deltas nothing yet has no namespace to sit under. */
export const NO_CAPABILITY = "no capability yet";

/**
 * Namespaces nested by their segments, with whatever is filed under each.
 *
 * A namespace is a path — `storefront/checkout`, `shared/ui` — and a flat list of those
 * paths makes a reader do the grouping themselves: everything under one product sorts
 * together only because the strings happen to share a prefix, and nothing says so. The
 * segments are the levels, so this nests them.
 *
 * `rows` are `{ namespace, item }` pairs — one item can be filed under two namespaces,
 * and `idOf` is how the counts tell that from two items.
 */
function buildTree(rows, idOf) {
  const empty = () => ({ children: new Map(), items: [] });
  const root = empty();

  for (const { namespace, item } of rows) {
    let at = root;
    for (const segment of namespace.split("/")) {
      if (!at.children.has(segment)) at.children.set(segment, empty());
      at = at.children.get(segment);
    }
    at.items.push(item);
  }

  // Named namespaces first, then the store's cross-cutting conventions, then whatever has
  // not said where it belongs yet — least settled last, in every sense.
  const rank = (name) =>
    name === NO_CAPABILITY ? 2 : name === TOP_LEVEL ? 1 : 0;

  return [...root.children.entries()]
    .map(([name, node]) => shape(name, name, node, idOf))
    .sort(
      (a, b) => rank(a.path) - rank(b.path) || a.name.localeCompare(b.name),
    );
}

/**
 * One namespace node: what it is called, what is filed directly under it, and the
 * namespaces inside it.
 *
 * `ids` is everything in the subtree, which is where `count` comes from — a change under
 * both `shared/ui` and `shared/design-sync` is one change to `shared`, and adding the
 * children's counts would say two.
 */
function shape(name, path, node, idOf) {
  // A namespace with nothing of its own and one namespace inside it is one level, not
  // two: `storefront` alone on a row above a lone `checkout` is a row that says nothing
  // the row beneath it does not, and it costs a whole level of indent to say it.
  if (node.items.length === 0 && node.children.size === 1) {
    const [childName, child] = [...node.children][0];
    return shape(`${name}/${childName}`, `${path}/${childName}`, child, idOf);
  }

  const children = [...node.children.entries()]
    .map(([childName, child]) =>
      shape(childName, `${path}/${childName}`, child, idOf),
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  const items = node.items
    .slice()
    .sort((a, b) => idOf(a).localeCompare(idOf(b)));
  const ids = new Set(items.map(idOf));
  for (const child of children) for (const id of child.ids) ids.add(id);

  return { name, path, items, children, count: ids.size, ids };
}

/**
 * In-development changes as the tree their namespaces already describe.
 *
 * A change that touches two namespaces is listed under both. The nav is for finding a
 * change from the area you have in mind, and a change that rewrites `shared/ui` really is
 * ui work however much auction work it also does — filing it under one of the two would
 * hide it from anyone looking under the other. The repeat is the honest shape, and a
 * parent counts such a change once however many of its namespaces it lands in.
 *
 * `capabilities` are the capability paths the change deltas, which is all the payload
 * carries: the nav needs the namespaces, and a namespace is in the path.
 */
export function changeTreeByNamespace(changes) {
  const rows = [];

  for (const change of changes) {
    const spaces = new Set(
      (change.capabilities ?? []).map((c) => namespaceOf(c) ?? TOP_LEVEL),
    );
    if (spaces.size === 0)
      rows.push({ namespace: NO_CAPABILITY, item: change });
    else for (const ns of spaces) rows.push({ namespace: ns, item: change });
  }

  return buildTree(rows, (change) => change.id);
}

/**
 * The one thing worth marking on a capability, or nothing at all.
 *
 * Most of a store is shipped capabilities nobody is currently rewriting, and a mark on
 * every one of them would hide the few that need an answer — the same rule the status
 * strip is built on. So this is null for the quiet case, and otherwise says what the
 * index page's flags say, in the same words.
 *
 * A capability being rewritten outranks the state it is in, because that is the thing
 * about to change; two changes rewriting it at once is the collision the board warns
 * about, and it outranks everything.
 */
export function capabilityFlag(cap) {
  if (cap.inDevelopment > 1)
    return { variant: "warning", label: `${cap.inDevelopment} in development` };
  if (cap.inDevelopment === 1)
    return { variant: "accent", label: "in development" };
  if (cap.state === "retired") return { variant: "neutral", label: "retired" };
  // No baseline and nothing bringing one in: named by a change that has since archived
  // without shipping it, or by one that removed it and left the name behind.
  if (cap.state === "unshipped")
    return { variant: "neutral", label: "no baseline" };
  return null;
}

/**
 * Whether the nav has anywhere to take a reader for this capability.
 *
 * A capability is in the catalogue if any change ever deltaed it, archive included — which
 * is right for the index page, where "named once and never shipped" is a fact a PM wants
 * to see. It is wrong for the nav. A store that renames its taxonomy leaves every old path
 * behind in the archived deltas that named them, and those paths have no spec to open and
 * no change bringing one: on a store that has done that once, they were eleven of the
 * fifteen top-level rows in this column, all of them dead ends.
 *
 * So the nav carries the two kinds that go somewhere — a shipped baseline to read, or a
 * change in development whose page says what is arriving — and the index page keeps all of it.
 */
export function isCurrent(cap) {
  return cap.shipped || cap.inDevelopment > 0;
}

/**
 * The capability catalogue as the same tree, so the nav reads one way throughout.
 *
 * The index page keeps the flat namespace bands: it is a page for comparing capabilities
 * across a namespace, and a band with every row under it does that better than a tree
 * does. The nav is for reaching one of them, which is what a tree is for.
 */
export function capabilityTreeByNamespace(caps) {
  return buildTree(
    caps.map((cap) => ({
      namespace: namespaceOf(cap.capability) ?? TOP_LEVEL,
      item: cap,
    })),
    (cap) => cap.capability,
  );
}
