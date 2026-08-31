## Why

The catalog stops answering the question it exists for once a store has more than a
handful of capabilities. On a store of any age it lists fifty-odd, each as a card carrying its whole
changed-by timeline — around nine screens of scrolling to find one name, and the page
grows with the store.

Two things a reader cannot see there today, both already sitting in the payload:

- **The store's capabilities are namespaced.** `shared-ui/cart`,
  `checkout/guest-checkout`, `admin/user-directory` — the path names a group,
  the catalog flattens it into one alphabetical run and throws it away. Nine namespaces of
  one to eleven are being shown as a run of 51.
- **A capability can be contested.** `collisions()` in `server/catalog.mjs` computes it and
  the board counts it in a tile, but the catalog — the one page that shows what is changing
  each capability — never says so. `storefront/pricing` sits between two in-flight
  changes deltaing it and reads exactly like the 32 quiet rows around it.

And one thing it says wrongly: a capability whose deltas ended in REMOVED has no baseline,
so the catalog files it under **In flight** — as behavior arriving rather than behavior
withdrawn. Two of the 51 are mislabelled this way.

This is mostly presentation. The one new **inference** is `retired`, and it is held to the
higher bar: read off deltas the store already wrote, never guessed from an absence.

## What Changes

- **Group rows by namespace, not by shipped state.** Each namespace becomes a section —
  its name, its count, its rows. Capabilities with no `/` in their path group last under a
  `top level` section, which is what a cross-cutting capability like `date-formats` is.
  This replaces the **Shipped** / **In flight** split, which separated capabilities a
  reader looks for by name.
- **The changed-by timeline leaves the index.** It stays in full on `spec/<id>`, where a
  reader has already chosen the capability. On the index only what changes the next action
  survives: something is rewriting this capability right now.
- **A capability's state becomes a per-row chip.** Nothing marks a quiet shipped row; a
  capability with one in-flight change reads `in flight`, and one with two or more reads
  `N changes in flight` in the warning tone the board already uses for collisions.
- **Rows are one line** — name, requirement and scenario counts, how long since the
  baseline last moved, chip — so a namespace section can flow into responsive columns at
  wide viewports. No grid/list mode: the columns follow the window, and there is nothing
  for a reader to remember or restore.
- **`retired` joins shipped and unshipped as a capability state.** A capability with no
  baseline whose newest delta is REMOVED is retired, and says so instead of claiming to be
  in flight.
- **A summary line replaces the two group counts**: how many capabilities the store has,
  and how many are shipped, unshipped, retired and contested.

Design approved from an interactive preview of the two views side by side,
built on a real store rather than on invented rows.

## Capabilities

### New Capabilities

- `catalog`: the index of every capability in the store — how it is grouped, what each row
  states, and which of shipped, unshipped, retired and contested it reports. First spec in
  this store, so it also fixes the shape of the catalog payload the view reads.

### Modified Capabilities

None. This store has no baseline specs yet.

## Impact

- `server/catalog.mjs` — `capabilityCatalog()` gains a `state` per capability and a count of
  the in-flight changes deltaing it. `collisions()` is untouched; the catalog derives
  contested from the `history` it already assembles rather than calling it, so the index
  costs no extra git work.
- `src/views/Catalog.jsx` — `Specs` and `Row` are rewritten around namespace sections;
  `ChangedBy` stays exactly as it is for `SpecDetail`.
- `src/app.css` — namespace section and row layout, and the responsive columns. Astryx has
  no primitive for either, and both are layout rather than design.
- `test/` — fixtures for the new inference: a store whose capability was added then
  removed, and a store with two in-flight changes on one capability.
- `CONTEXT.md` — **namespace** and **retired** are new terms; **catalog** gains the grouping.
- `README.md` — the catalog screenshot and its description.

## Non-goals

- **Writing to the store.** Permanently out of scope: every claim and checkmark is a commit
  made by the CLI, and a viewer that could write would break the convention it exists to show.
- **A grid/list toggle**, or any view mode the reader sets and the viewer remembers.
- **Search or filtering** in the catalog. Grouping is what this store needs at 51; a filter
  is the answer at several hundred, and adding it now would hide whether the grouping worked.
- **Sequencing collisions.** The catalog names a contested capability; deciding which change
  archives first stays PM's call, as it is on the board.
- **Touching `spec/<id>`.** The detail page, its timeline and its outline rail are unchanged.
