## 1. The payload: what a capability is

- [x] 1.1 Add `capabilityState({ shipped, history })` to `server/catalog.mjs` — a pure
      function returning `shipped`, `retired` or `unshipped`. Retired is: no baseline, and
      the newest delta is REMOVED. Order deltas by `at`, falling back to `archivedOn` when
      a store has no git history, so an undated store still orders them.
- [x] 1.2 Have `capabilityCatalog()` put `state` on every entry, plus `inFlight` — the count
      of `history` entries with `archived: false`. No new directory read and no new git
      spawn: both come from the walk it already does.
- [x] 1.3 Write `test/catalog-state.test.mjs` against `capabilityState` with plain objects —
      one case per edge in the spec: shipped with a baseline, unshipped, retired,
      removed-then-added-again, REMOVED while a baseline still exists, and a history whose
      entries carry no `at` at all.
- [x] 1.4 Add the drift check to `test/collisions.test.mjs`: build a temp store where two
      in-flight changes delta one capability, and assert the capabilities the catalog counts
      as contested are exactly the ones `collisions()` reports. This is what keeps the row
      chip and the board tile from quietly disagreeing.
- [x] 1.5 Verify: `pnpm test`

## 2. The catalog index

- [x] 2.1 Rewrite `Specs` in `src/views/Catalog.jsx` around namespace groups: namespace is
      everything before the last `/`, named groups alphabetical, `top level` last — and no
      group header at all when nothing in the store is namespaced. Each header carries its
      count.
- [x] 2.2 Add the summary line — capabilities, shipped, unshipped, retired, contested —
      omitting any count that is zero, and replacing the Shipped / In flight group split.
- [x] 2.3 Rebuild `Row` as one line: name within its namespace, requirement and scenario
      counts (or `no baseline` / `retired`), how long since the baseline last moved, and the
      chip — `in flight` for one, `N changes in flight` in the `warning` variant for a
      contested capability.
- [x] 2.4 Take the timeline off the index: `Row` stops rendering `ChangedBy`, and `ChangedBy`
      and `Entry` lose the `compact` prop and its branches now that `SpecDetail` is the only
      caller.
- [x] 2.5 Write `test/capabilities.test.mjs` against the grouping rules — nested namespace,
      `top level` ordered last, and the store where nothing is namespaced and the heading
      comes off. Added during apply: the rules came out of the view as pure functions in
      `src/capabilities.js`, and the spec has four scenarios about them.
- [x] 2.6 Verify: `pnpm test && pnpm build`, then read the index in the browser against a
      store with real namespaces and against this repo's own store, which has no baselines
      at all — that is the empty case in the spec, and it is one directory away.

## 3. The layout

- [x] 3.1 Add the namespace header and one-line row to `src/app.css`, beside `.status-strip`
      and `.timeline`. Layout only — every colour, size and weight stays an Astryx token or
      component.
- [x] 3.2 Flow each group's rows into columns with `column-width`, not grid, so the
      alphabetical order reads down a column rather than across a row, with `break-inside:
      avoid` on the row. Per group, so a group of one leaves no empty cells beside it.
- [x] 3.3 Check the page at a narrow width, at full width, and in both themes; confirm
      `spec/<id>` and its outline rail are untouched.
- [ ] 3.4 Verify: `pnpm build`

## 4. The words

- [ ] 4.1 Add **namespace** and **retired** to `CONTEXT.md`, and update **Catalog** to say it
      is grouped. Retired belongs beside **Shipped capability**; it is a third state, not a
      kind of unshipped.
- [ ] 4.2 Update the catalog's description and screenshot in `README.md`.
- [ ] 4.3 Verify: `pnpm test && pnpm build`
