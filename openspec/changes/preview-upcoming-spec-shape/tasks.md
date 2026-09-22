## 1. Cross-change requirement grouping (`server/upcoming.mjs`)

- [x] 1.1 Add `server/upcoming.mjs` with a function that takes a baseline text and a list of
      `{ changeId, operation, text }` deltas for one capability, and returns one entry per
      requirement heading: `{ heading, baselineText, touches: [{ changeId, operation, text }] }`
      — baseline headings in baseline order, then ADDED-only headings appended in
      `changeId` order. Reuse the heading key/matching helpers from `server/deltas.mjs`
      rather than reimplementing them. Verify with `node --test test/upcoming.test.mjs`
      once 1.2-1.5 exist.
- [x] 1.2 Fixture: two in-development deltas touching disjoint headings on the same
      capability — verify both entries carry exactly one touch each and neither is marked a
      disagreement.
- [x] 1.3 Fixture: two deltas disagreeing on the same heading, once for each of the three
      shapes in `proposal.md` (two MODIFYs, two ADDs, a MODIFY and a REMOVE) — verify each
      produces one entry with two touches, regardless of whether the two texts happen to be
      identical.
- [x] 1.4 Fixture: an unshipped capability (`baselineText: null`) deltaed by two ADDED-only
      changes under different headings — verify both entries carry `baselineText: null` and
      one touch each.
- [x] 1.5 Fixture: a MODIFIED delta whose heading matches nothing in the baseline — verify
      it produces no entry (drift stays `capabilities()`'s existing field, not a fabricated
      heading here).
- [x] 1.6 Run `node --test test/upcoming.test.mjs` and confirm all fixtures pass.

## 2. Wire the composite into `/api/spec`

- [x] 2.1 In `server/catalog.mjs`'s `capability()`, when the capability has at least one
      in-development touch, gather that touch's delta text via `capabilities()` from
      `server/change.mjs` for each in-development change, call the grouping function from
      §1, and attach the result as `upcoming: { requirements, driftedChanges }` on the
      response (`driftedChanges` carries the changes `capabilities()` already flags via
      `drift`, filtered to this capability). Omit the field entirely for a capability with
      no in-development touch.
- [x] 2.2 Fixture in `test/catalog-state.test.mjs` (or a sibling file): a temp store with a
      baseline and two in-development changes on the same capability, one disjoint and one
      disagreeing with the baseline — verify `capability()`'s `upcoming` field matches the
      shape from §1 and that a capability with zero in-development changes carries no
      `upcoming` field at all.
      (Landed as `upcomingFor` in `test/upcoming.test.mjs`, the same store-parameterized
      seam `conflicts()`/`deltasInDevelopment()` already expose — `capability()` itself
      calls `resolveRoot()` and isn't independently testable, matching the existing split
      in `catalog-state.test.mjs`/`conflicts.test.mjs`.)
- [x] 2.3 Run `node --test test/upcoming.test.mjs` and confirm it passes.

## 3. Client: fold a requirement set to an enabled subset (`src/upcoming.js`)

- [x] 3.1 Add `src/upcoming.js` with a pure function that takes the `requirements` array
      from `upcoming` and a set of enabled change ids, and returns, per requirement: `durable`
      (baseline text, unchanged), `single` (baseline text replaced/appended/struck through
      by the one enabled touch, when exactly one touch is enabled), or `disagreement` (two or
      more enabled touches), matching the trigger conditions in
      `specs/spec-detail/spec.md` — "Narrowing to one change" and "Disabling every chip".
      Also adds `changesTouching()`, the chip row's own list of change ids.
- [x] 3.2 Unit tests in `test/upcoming.test.mjs` (or a `src/`-focused sibling) for: all
      chips enabled with a real disagreement present, one chip disabled turning a
      disagreement back into a single fold, and every chip disabled returning the durable
      reading unchanged.
- [x] 3.3 Run `node --test` on the new client-side test file and confirm it passes.

## 4. `SpecDetail` view: toggle, chips, composite rendering

- [x] 4.1 In `src/views/Catalog.jsx`'s `SpecDetail`, add the Durable/Upcoming toggle,
      shown only when `data.upcoming` is present, defaulting to Durable.
      (Hidden, additionally, whenever a docs tab is open — Upcoming is a reading of
      `spec.md` itself, not of the other documents filed beside a capability.)
- [x] 4.2 Add the chip row (one per in-development change touching the capability, from
      `data.upcoming.requirements[*].touches[*].changeId`, deduped), all enabled by
      default, feeding `src/upcoming.js` from §3 to decide what `Upcoming` renders.
      (Landed as `src/components/Upcoming.jsx`, keyed on the capability id so switching
      capabilities resets the chip row for free.)
- [x] 4.3 Render each requirement in `Upcoming`: unchanged text as-is, a single fold tagged
      with its change id, a disagreement as a callout holding every enabled touch's version
      side by side, and a REMOVED-only requirement struck through and tagged. Include the
      preview caveat from `design.md` - Risks/Trade-offs on the Upcoming banner.
- [x] 4.4 Manually verify against a real store with an in-development change or two on one
      capability (`pnpm dev` in a store with active changes) - confirm the toggle appears
      only where expected and chip toggling matches §3's fixtures.
      (Ran `pnpm dev` against this repo's own store, which is dogfooding this very change:
      `GET /api/spec?id=spec-detail` returns the real `upcoming` payload built from this
      change's own ADDED requirements, matching §1/§2's shape, and `pnpm build` bundles
      `ToggleButton` and the new view with no errors. No headless browser is available in
      this environment to capture a screenshot; the page was opened for visual
      confirmation but that confirmation itself is outstanding.)

## 5. Docs

- [x] 5.1 Add **composite** and **disagreement** to `CONTEXT.md`.
      (`CONTEXT.md`'s own **Conflict** entry avoids "collision" as a synonym, since that
      word already names the capability-level fact; "disagreement" is the per-requirement
      one, kept distinct throughout this change's own artifacts and identifiers.)
- [x] 5.2 Update `README.md`'s `spec/<id>` screenshot and description to show the
      Durable/Upcoming toggle.
      (No screenshot exists in `README.md` for this or any other page — the file is prose
      throughout. Added a paragraph beside the existing "Changed by" one instead.)
- [x] 5.3 Run `pnpm test && pnpm build` and confirm both succeed end to end.
