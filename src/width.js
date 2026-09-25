/**
 * How wide a document page reads: the default measure prose is set at, or the full width
 * of the page — for a table the store writes wider than 52rem has room for.
 *
 * Not a property of the document, the way the lens is not either: two readers on the same
 * spec want different things from the same table, so this is remembered per browser like
 * the appearance and the nav's names.
 */
export const WIDTHS = [
  { value: "default", label: "Default width" },
  { value: "full", label: "Full width" },
];

export const DEFAULT_WIDTH = "default";

const KEY = "openspec-viewer.width";

const isWidth = (value) => WIDTHS.some((w) => w.value === value);

export function loadWidth() {
  const saved = window.localStorage?.getItem(KEY);
  return isWidth(saved) ? saved : DEFAULT_WIDTH;
}

export function saveWidth(width) {
  try {
    window.localStorage?.setItem(KEY, width);
  } catch {
    // Private browsing or a blocked store: the choice just does not persist.
  }
}
