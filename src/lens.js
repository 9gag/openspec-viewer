/**
 * The three roles read the same store for different reasons, so the dashboard has a
 * lens rather than three dashboards.
 *
 * It is a *view preference*, not access control — everyone can see everything, which is
 * the whole premise of a shared store. What the lens changes is what a change opens on
 * and which panels lead, because "all of it, in one order, for everyone" is how a
 * dashboard becomes something nobody checks.
 */
export const LENSES = {
  engineer: {
    label: "Engineer",
    // Opens on the checklist you are working through, and the spec it has to satisfy.
    defaultTab: "tasks",
    panels: ["idle", "unclaimed"],
    blurb: "What is claimable, what you own, and the specs behind it.",
  },
  pm: {
    label: "PM",
    // Opens on the proposal, because PM's question is "is this change coherent yet".
    defaultTab: "proposal",
    panels: ["collisions", "idle", "unclaimed"],
    blurb:
      "Capability collisions, idle claims, and unclaimed work. Completeness and validation are on each change.",
  },
  designer: {
    label: "Designer",
    // Opens on the design artifacts, which nothing else in the toolchain surfaces.
    defaultTab: "design-artifacts",
    panels: ["design-status", "collisions"],
    blurb: "Flows and copy decks, next to the specs they inform.",
  },
};

export const DEFAULT_LENS = "engineer";

/**
 * The board panels a lens may ask for. Board.jsx renders exactly these names, and a test
 * pins the two lists together — a lens naming a panel nobody renders silently produces an
 * empty board, which is how the designer lens shipped showing "nothing to chase".
 */
export const PANELS = ["collisions", "design-status", "idle", "unclaimed"];

/** Remembered per browser: a role is a property of the person, not of the session. */
const KEY = "openspec-viewer.lens";

export function loadLens() {
  // ?lens=pm wins over the saved choice, so a link can carry the view it was written for
  // ("look at the board as PM"). It is not persisted — the override lasts for the visit.
  const fromUrl = new URLSearchParams(window.location.search).get("lens");
  if (fromUrl && LENSES[fromUrl]) return fromUrl;

  const saved = window.localStorage?.getItem(KEY);
  return saved && LENSES[saved] ? saved : DEFAULT_LENS;
}

export function saveLens(lens) {
  try {
    window.localStorage?.setItem(KEY, lens);
  } catch {
    // Private browsing or a blocked store: the lens just does not persist.
  }
}

// Idle thresholds live in time.js, next to the formatting they drive and the tests that
// pin them. Import from there rather than re-declaring them here.
