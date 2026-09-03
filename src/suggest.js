/**
 * What the search box offers while you are still typing it.
 *
 * Two different questions arrive at one box. "Where does it say webhook" is a search, and
 * only the store's text can answer it; "take me to the checkout spec" is a name the reader
 * half-remembers, and the answer is a page they could have found in the tree if they knew
 * where it was filed. The second is a lookup, and making them type it out in full and then
 * read a page of hits to find the document they already named is the tree's failure twice
 * over.
 *
 * So the completions are the names the store issues — its capabilities and the changes in
 * development — and picking one goes to that page. Both lists are already in the browser
 * for the nav's own tree, so this costs no request and nothing to keep in sync: what can be
 * completed is exactly what can be navigated to.
 *
 * The search itself is always the first entry, so the box behaves as it did — type and
 * press Enter — and the completions are what the arrow keys reach.
 *
 * Pure, and free of the route helper: this decides what a suggestion *is*, and the view
 * that renders it decides how to address it.
 */

/** Completions offered. The first entry is the search, and is not one of them. */
const MAX = 8;

/**
 * How well a name matches, lowest first.
 *
 * A name here is a path or a kebab id, so its parts are its words: typing `checkout` should
 * reach `storefront/checkout` before `admin/checkout-audit`, and both before a name that
 * merely contains the letters somewhere. The last segment is what decides it — that is the
 * part people say out loud, and the rest of the path is only where it is filed.
 *
 * Null for no match at all.
 */
export function score(name, needle) {
  const at = name.toLowerCase().indexOf(needle);
  if (at === -1) return null;

  const leaf = name.slice(name.lastIndexOf("/") + 1).toLowerCase();
  if (leaf === needle) return 0;
  if (leaf.startsWith(needle)) return 1;
  if (at === 0) return 2;
  // A path separator or a hyphen is where one word ends and the next begins, in a store
  // that writes both `shared/ui/cart` and `add-guest-checkout`.
  return "/-".includes(name[at - 1]) ? 3 : 4;
}

/**
 * The menu for a query: the search, then the names it could mean.
 *
 * Shaped as Astryx's `SearchableItem` — an id, a label, and whatever the caller needs on
 * `auxiliaryData` — because that is what the typeahead takes.
 */
export function suggestions(query, { capabilities = [], changes = [] } = {}) {
  const q = String(query ?? "").trim();
  if (!q) return [];
  const needle = q.toLowerCase();

  const named = [
    ...capabilities.map((name) => ({
      kind: "capability",
      view: "spec",
      arg: name,
    })),
    ...changes.map((name) => ({ kind: "change", view: "change", arg: name })),
  ]
    .map((item) => ({ ...item, score: score(item.arg, needle) }))
    .filter((item) => item.score !== null)
    .sort((a, b) => a.score - b.score || a.arg.localeCompare(b.arg))
    .slice(0, MAX);

  return [{ kind: "search", view: "search", arg: q }, ...named].map((item) => ({
    id: `${item.kind}:${item.arg}`,
    label: item.arg,
    auxiliaryData: item,
  }));
}
