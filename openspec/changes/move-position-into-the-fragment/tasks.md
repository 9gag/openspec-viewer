## 1. The address, parsed and written

- [ ] 1.1 Add `withPosition(route, key, id)` to `src/toc.js` — appends `?<key>=<encoded id>`
      to a hash route, and returns the route unchanged when the id is empty. Rewrite
      `headingLink(id, route)` to go through it, and `absoluteLink` to take the built
      fragment rather than a query string, keeping `window.location.search` untouched so a
      copied link still carries `?mode=dark`.
- [ ] 1.2 Have `routeFrom` in `src/api.js` split the position off the hash on the first `?`
      before it splits segments, and return `position: { to, at }` — nulls when absent, and
      null for a key that is present but empty. A fragment that is only a position
      (`#?to=purpose`) still names no route, the same as any fragment without a leading
      slash.
- [ ] 1.3 Point `linkedHeading` (`src/toc.js`) and `linkedScenario` (`src/spec.js`) at a
      hash instead of a search string, defaulting to `window.location.hash`. Names, arity
      and return stay as they are; delete `withoutPosition` and its export.
- [ ] 1.4 Extend `test/route.test.mjs`: a route carrying a position parses to the same
      view/arg/tab as one without, an argument whose encoding contains `%3F` is not split
      on, a position with no route names no route, and an empty `?to=` reads as no position.
- [ ] 1.5 Extend `test/toc.test.mjs` and `test/spec.test.mjs` for the new shapes, and add
      the round-trip that is the real contract: for a set of ids including one with spaces
      and one slug-shaped like a route, `routeFrom(withPosition(route, key, id))` returns
      that route and that id.
- [ ] 1.6 Verify: `pnpm test` — the toc, route and spec suites are the change at this point;
      the app is expected to be mid-move and is not run yet.

## 2. The pages that read a position

- [ ] 2.1 `src/components/ScenarioRef.jsx` — `target()` builds `#…?at=<id>` through
      `withPosition` instead of prefixing a query. Rewrite the comment: the fragment is the
      route _and_ the position now, and that is the reason the two travel together.
- [ ] 2.2 `src/components/CopyLink.jsx` — take the position rather than a pre-built query
      string, and rewrite the paragraph explaining why it was a query.
- [ ] 2.3 `src/components/WithOutline.jsx` — the rail's click handler pushes
      `withPosition(window.location.hash, "to", id)`, and the arrival scroll reads the
      position from the hash. Behavior unchanged: same scroll, same `markSection`.
- [ ] 2.4 `src/components/SpecText.jsx` — `linkedScenario()` now reads the hash; the
      `useMemo(…, [])` that pins it to arrival stays exactly as it is.
- [ ] 2.5 `src/views/ChangeDetail.jsx` and `src/views/Catalog.jsx` — `tabAsked` and the
      catalog's `tabForAnchor` call read the position from the route rather than from
      `window.location.search`. The tab a link opens is unchanged.
- [ ] 2.6 Verify: `pnpm test && pnpm build`, then in the browser copy a heading link and a
      scenario link, paste each into a new tab, and confirm the page opens on the right tab,
      scrolled and marked.

## 3. The scrub comes out

- [ ] 3.1 Delete the stale-query branch of `useRoute` in `src/api.js`: the `opened` ref, the
      comparison against it and the `replaceState`. Rewrite the block comment above the hook
      — the reason the scrub existed is now the reason it does not need to.
- [ ] 3.2 Keep the route object when only the position changed: compare `view`/`arg`/`tab`
      against the held route and reuse it, replacing `position` alone. This is what stops
      back-after-two-rail-clicks from remounting the view and losing the reader's scroll.
- [ ] 3.3 Verify: `pnpm test && pnpm build`, then walk it in the browser — open a heading
      link, follow a nav entry, and confirm the address that results carries no position and
      `?mode` survives it. Click two rail entries and press back twice; the document must not
      jump or re-render.

## 4. Old links still land

- [ ] 4.1 Add the one-time rewrite to `src/main.jsx`, before `createRoot`: a `to` or `at` in
      the real query moves into the fragment through `withPosition` and out of the query via
      `replaceState`, with the fragment's own position winning if both halves carry one.
      Export the function so it can be tested against a plain `{ search, hash }`.
- [ ] 4.2 Test it in `test/route.test.mjs` against the scenarios in the spec: the plain old
      link, one that also carries `?mode=dark`, one carrying both shapes, and an address with
      no position at all, which must be left byte-for-byte alone rather than rewritten to an
      equivalent.
- [ ] 4.3 Verify: `pnpm test && pnpm build`, then paste an old-shape link into the browser —
      it opens on the position and the address bar shows the new shape, and one press of back
      leaves the viewer.

## 5. The docs

- [ ] 5.1 `README.md` — rewrite "A position leaves with the page it named" around the new
      arrangement (it is now a property of the shape, not of a rule the app enforces), and
      fix the `?at=` and copy-button passages that describe the position as living in the
      query.
- [ ] 5.2 `CONTEXT.md` — add **position** as a term if it is not already one: a heading or a
      scenario inside one document, addressed in the fragment beside the route, as distinct
      from a **reading** (`?mode`, `?board`, `?filter`) which survives navigation.
- [ ] 5.3 Verify: `pnpm test && pnpm build`, and read the README passages against the
      addresses the running app actually produces.
