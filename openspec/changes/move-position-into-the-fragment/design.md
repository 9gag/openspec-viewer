## Context

See proposal.md — Why. What matters here is where the two halves live today.

The route is read in exactly one place — `routeFrom` in `src/api.js`, hung off `hashchange`
by `useRoute`. The position is read in six: `WithOutline`, `SpecText`, `ChangeDetail`,
`Catalog`, and `linkedHeading` / `linkedScenario` beneath them, each reaching for
`window.location.search` directly at the moment it happens to care. That asymmetry is the
whole problem in miniature — the route has one reader and can be kept coherent; the position
has six and has to be swept up centrally after the fact.

Nothing here crosses the seam. `server/` is untouched, no endpoint changes, no payload
changes: this is entirely `src/`, and the only thing being reshaped is a string.

## Goals / Non-Goals

**Goals:**

- One reader for the whole address. `routeFrom` returns the position alongside the view,
  the argument and the tab, and is the only thing that parses.
- Deleting the scrub, not relocating it. If the change ends with a different piece of
  machinery keeping stale positions out of the address, it has failed.
- No remount and no scroll jump on a navigation that only changes the position.

**Non-Goals:**

- Reworking how a position is _acted on_ — the scroll, `markSection`, the tab a link opens,
  the requirement a scenario opens inside. Those read the position from a new place and are
  otherwise untouched.
- Making the position a React prop threaded down the tree. See the decision on where
  components read it from.

## Decisions

### The fragment holds `<route>?<position>`, split on the first `?`

`#/change/add-guest-checkout/specs?at=store-cart-SC-01`. Query syntax inside a fragment,
parsed with `URLSearchParams` on the part after the first `?`, so the position keeps the
`to` / `at` keys it has and everything that reads one keeps its shape.

Splitting on the _first_ `?` is safe because every route segment is written with
`encodeURIComponent`, which escapes `?` to `%3F`. A capability or change whose name
contained a `?` — nothing does, but directory names are not the viewer's to constrain —
cannot produce a raw `?` in the route half. Anchors cannot either: `slugify` and
`scenarioAnchor` both reduce to `[a-z0-9-]`.

_Rejected — the route in the query, `/?p=/spec/x`._ This is the shape the inside-out URL
first suggests, and it is worse on both counts that motivate the change. Every internal
link becomes a full page reload unless each one is intercepted with `preventDefault` +
`pushState` + a `popstate` listener, where today `<a href="#/spec/x">` navigates with no
JavaScript at all and back/forward arrive as `hashchange` for free. And it moves the route
_onto_ the wire — into request lines and `Referer` headers — when the point was to take the
position off it.

_Rejected — history routing, `/spec/storefront/checkout`._ The conventional address, and it
needs a rewrite rule on whatever serves the built bundle. `src/api.js` chose hash routing so
the bundle works served from anywhere; that trade is not reopened here.

_Rejected — one opaque key, `#/spec/x?pos=to:purpose`._ Collapses two keys into one and buys
nothing; `to` and `at` are already distinct because they are acted on differently.

### `routeFrom` returns the position; the helpers keep their names and take a hash

`routeFrom` gains a `position: { to, at }` (nulls when absent), so the part of this that can
be wrong stays a pure function of a string and stays testable without a browser — the reason
it was exported in the first place.

`linkedHeading` and `linkedScenario` stay, with the same names and the same one-value return,
but their argument becomes a hash rather than a search string and defaults to
`window.location.hash`. Every call site keeps its shape; only what it passes changes.

_Rejected — threading the position down as a prop._ It is the honest React answer and it is
the wrong one here. `SpecText` and `WithOutline` deliberately read the position **once**, on
the way in — `useMemo(…, [])`, a `scrolled` ref — because a position is a thing that happens
at arrival, not a thing the page tracks. A prop would re-run those effects whenever the
address changed for any other reason, and the components would have to defend against it.

### `withPosition(route, key, id)` is the one place a positioned address is assembled

Two call sites build one today and they do not look alike: `headingLink` in `src/toc.js` and
`target()` in `src/components/ScenarioRef.jsx`. Both go through one helper, which is also
what `routeFrom` is the inverse of — round-tripping them against each other is the test that
matters.

`absoluteLink` follows: it takes the built fragment rather than a query string, and keeps
`window.location.search` untouched, which is what makes a copied link carry `?mode=dark`.

### The old-shape rewrite runs before React mounts

In `src/main.jsx`, before `createRoot`, not in an effect. `SpecText` reads its position
during the first render; an effect that rewrote the address afterwards would be too late for
exactly the link the compatibility exists to serve.

`history.replaceState`, so an old link costs one history entry and back leaves the viewer.
The fragment wins if both halves carry a position: the fragment is what the viewer writes,
so a URL carrying both was assembled by something else.

### The route object is kept when only the position moved

`useRoute` compares the new `view`/`arg`/`tab` against the ones it holds and reuses the
existing object when they match, replacing only `position`.

This is not a micro-optimisation, it is the behavior. Astryx's outline rail pushes a new
address on every click and — under the old scheme, where those entries differed only in the
query — pressing back fired `popstate` and no `hashchange`, so nothing re-rendered. Under the
new scheme those entries differ in the _hash_, so back does fire `hashchange`, and a fresh
route object each time would remount the view and throw away the reader's scroll position
between two headings of the same document.

### What goes

`withoutPosition` in `src/toc.js`, the `opened` ref in `useRoute`, and the `replaceState`
branch it guarded. There is no replacement: a position cannot be inherited by the next page
because writing the next page's address overwrites it in the same string. The comments on
those, and the several in `CopyLink`, `WithOutline` and `spec.js` explaining why a position
had to live in the query, are rewritten rather than deleted — the constraint they describe
is real and its new answer is worth the same paragraph.

## Risks / Trade-offs

- **A fragment carrying query syntax is unusual, and the next reader will wonder.** →
  It is documented in `README.md`, and `routeFrom`'s comment already carries the argument
  for why the fragment is spent on the route; this is the other half of it.

- **The rail's `pushState` leaves `useRoute`'s `position` stale.** `pushState` fires no
  event, so after a rail click the address names a heading the route object does not. →
  Nothing reads the position from route state at that moment: the components that act on a
  position read `window.location.hash` at arrival, which is exactly the case `pushState`
  is not. The route object holds it for `tabAsked` and the tests.

- **Old links in tasks, PRs and chat.** → Read and rewritten on load, with scenarios pinning
  it. The cost is a compatibility branch that has to be deliberately removed later rather
  than quietly kept forever; the proposal names its removal as a separate change.

- **`?to=` and `?at=` in the real query stop meaning anything the app writes**, so a reader
  hand-editing an address in the old shape gets one rewrite and then a shape they did not
  type. → That is the intended reading; the alternative is honouring both forever.

- **Cost: none worth counting.** No fetch, no git, no endpoint. The parse adds a
  `String.indexOf` and a `URLSearchParams` per `hashchange` — once per navigation — and
  removes a `replaceState` from the same path.

## Migration Plan

No deploy step and no data. The compatibility reader is the migration: both shapes open the
right page from the moment this ships, and only the new one is written.

Rollback is a revert, and it is not symmetric — worth saying plainly. Old code reads
`#/spec/storefront%2Fcheckout?to=purpose` as a capability _named_
`storefront/checkout?to=purpose`, and shows the "cannot read" state rather than the page. So
a link copied while this is deployed does not survive a revert, where a link copied before it
survives in both directions. Given the audience is whoever is working on the viewer and the
links live in this repo's own tasks, that is an acceptable one-way door; it is the reason the
compatibility reader is worth its branch and a revert is not the plan for a mistake here.
