/**
 * How much of the board is on screen.
 *
 * The full board is built for whoever has to act on it: the queues at the top, the panels
 * that say what is wrong, and a table of task groups under every change. That is the right
 * amount for the person running the plan and far too much for the person asking how far
 * along it all is — a PM in a standup, a lead glancing at it between meetings, which is
 * most of the people who open this.
 *
 * So simplified is what the page opens as: the changes in development, each with its
 * overall progress, and — where two of them delta the same capability — the warning that
 * says so. Not a density control: the queues are not shrunk, they are gone, because a
 * reader who wants the answer to "how far along" is not the reader who clicks a tile.
 * The conflict warning stays because it is not a queue — nobody is waiting on it, and
 * the change it breaks is broken at archive time, by this reader. One switch away, and
 * remembered once switched.
 */

// Remembered per browser, like the appearance, the nav's names and the spec lens: which
// of the two readings you want is a property of what you are doing today, not of the store.
const KEY = "openspec-viewer.board-simple";

// The reading a first visit gets. Simplified, because the board answers "how far along is
// everything" for far more people than it answers "what do I do next" for, and the queues
// are one switch away for whoever came for those.
export const DEFAULT_SIMPLE = true;

export function loadSimple() {
  try {
    // ?board=simple so a link can carry the reading it was written for — the same reason
    // the appearance takes one. Not persisted: the override lasts the visit.
    const fromUrl = new URLSearchParams(window.location.search).get("board");
    if (fromUrl === "simple") return true;
    if (fromUrl === "full") return false;

    const saved = window.localStorage?.getItem(KEY);
    // Nothing saved is a first visit, not a preference for the full board — reading the
    // absent value as "false" would make the default unreachable.
    return saved === null || saved === undefined
      ? DEFAULT_SIMPLE
      : saved === "true";
  } catch {
    // A blocked store is not a reason to fail to render a board.
    return DEFAULT_SIMPLE;
  }
}

export function saveSimple(value) {
  try {
    window.localStorage?.setItem(KEY, String(value));
  } catch {
    // Private browsing: the choice just does not persist.
  }
}

/**
 * How many lines a namespace band and everything under it will draw.
 *
 * One per change filed directly under it, one per heading, and the same again for every
 * namespace inside — the count the reader sees, not the number of distinct changes, since
 * a change filed under two namespaces draws a line in both.
 */
function lines(node) {
  return (
    1 +
    node.items.length +
    node.children.reduce((n, child) => n + lines(child), 0)
  );
}

/**
 * The top-level bands, split across two columns.
 *
 * Split at a point rather than dealt out alternately, so the reading order survives: the
 * first column holds the first bands in the store's own order and the second holds the
 * rest, which is how a reader coming from the nav expects to find them. The split point
 * is the one that leaves the two columns closest in height — measured in lines drawn, not
 * bands, because a band of one and a band of eleven are not the same amount of page.
 *
 * Every prefix is tried because there are a handful of top-level namespaces, not
 * thousands; the honest quadratic is cheaper to read than a clever scan.
 */
export function splitIntoColumns(nodes) {
  if (nodes.length < 2) return [nodes, []];

  const weights = nodes.map(lines);
  const total = weights.reduce((n, w) => n + w, 0);

  let best = 1;
  let bestGap = Infinity;
  let left = 0;

  for (let cut = 1; cut < nodes.length; cut += 1) {
    left += weights[cut - 1];
    const gap = Math.abs(total - left - left);
    if (gap < bestGap) {
      bestGap = gap;
      best = cut;
    }
  }

  return [nodes.slice(0, best), nodes.slice(best)];
}
