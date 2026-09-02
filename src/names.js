/**
 * How a change or a capability is named in the nav.
 *
 * The store's ids are kebab-case paths, because that is what they are on disk and what
 * you type at the CLI — but a column of `verify-figma-annotation-implementation` is read
 * word by word, hyphen by hyphen, and the nav is the one place on the page you are
 * scanning rather than reading. So the nav can show them as sentences instead.
 *
 * A toggle rather than a decision: the id is the thing you paste into `openspec show`,
 * and someone working from the terminal wants to see exactly that. Remembered per
 * browser, the same way the appearance is, because which of the two you want is a
 * property of what you are doing rather than of the store.
 */

/** Sentence case: the id's own words, the first one capitalised, no hyphens. */
export function sentenceCase(id) {
  const words = String(id).split(/[-_]+/).filter(Boolean);
  if (words.length === 0) return String(id);

  const [first, ...rest] = words;
  // Only the first letter is touched. Lowercasing the rest would flatten a word the
  // store deliberately capitalised, and uppercasing anything else would be guessing at
  // which of `ui`, `zzz` and `sc` are acronyms.
  return [first[0].toUpperCase() + first.slice(1), ...rest].join(" ");
}

/**
 * One segment of a path, as a name.
 *
 * A whole segment of three letters or fewer is an acronym or a product code — `ui`,
 * `api`, `zzz` — never a word, so it is set in capitals rather than as "Ui". The rule
 * deliberately stops at the segment: applied to the words *inside* a name it would turn
 * `add-lot-user-bid-history` into "ADD lot user BID history", and the short words in a
 * sentence are exactly the ones that are not acronyms.
 */
const segmentName = (segment) =>
  /^[a-z]{1,3}$/.test(segment) ? segment.toUpperCase() : sentenceCase(segment);

/**
 * A name for display. Paths keep their separators and take the rule segment by segment,
 * so `shared/ui` reads as `Shared/UI` rather than losing the level it names.
 */
export const displayName = (id, plain) =>
  plain ? String(id).split("/").map(segmentName).join("/") : String(id);

// Remembered per browser: which spelling you want depends on whether you are reading the
// board or pasting ids into a terminal, not on the store.
const KEY = "openspec-viewer.plain-names";

export const DEFAULT_PLAIN_NAMES = true;

export function loadPlainNames() {
  try {
    const saved = window.localStorage?.getItem(KEY);
    return saved === null || saved === undefined
      ? DEFAULT_PLAIN_NAMES
      : saved === "true";
  } catch {
    // A blocked store is not a reason to fail to render a nav.
    return DEFAULT_PLAIN_NAMES;
  }
}

export function savePlainNames(plain) {
  try {
    window.localStorage?.setItem(KEY, String(plain));
  } catch {
    // Private browsing: the choice just does not persist.
  }
}
