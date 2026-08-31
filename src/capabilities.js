/**
 * How the catalog is arranged, kept out of the view so the ordering rules can be tested.
 *
 * OpenSpec writes the grouping into the capability path itself — `shared-ui/cart`,
 * `checkout/guest-checkout` — and the catalog used to sort it away into one
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
 * Capabilities grouped for reading: named namespaces alphabetically, then the ones with
 * no namespace at all.
 *
 * Those go last and under a name of the viewer's own, because they are the store's
 * cross-cutting conventions rather than a domain — `date-formats` belongs to
 * everything. When they are the only thing in the store there is no grouping left to
 * describe, so `titled` goes false and the heading comes off: a single header over the
 * whole page names nothing a reader cannot already see.
 */
export function groupByNamespace(caps) {
  const by = new Map();

  for (const cap of caps) {
    const key = namespaceOf(cap.capability) ?? TOP_LEVEL;
    if (!by.has(key)) by.set(key, []);
    by.get(key).push(cap);
  }

  const named = [...by.keys()]
    .filter((k) => k !== TOP_LEVEL)
    .sort((a, b) => a.localeCompare(b));
  const order = by.has(TOP_LEVEL) ? [...named, TOP_LEVEL] : named;

  return order.map((name) => ({
    name,
    titled: named.length > 0,
    caps: by
      .get(name)
      .slice()
      .sort((a, b) => leafOf(a.capability).localeCompare(leafOf(b.capability))),
  }));
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
    // Two in-flight changes on one capability: the collision the board counts, named here
    // against the capability it will break.
    contested: caps.filter((c) => c.inFlight > 1).length,
  };
}
