## Why

A reader who copies a link to a heading gets an address that reads inside-out:

```
/?to=storefront%2Fcheckout--a-guest-checkout-needs-no-account#/spec/storefront%2Fcheckout
```

The position comes first and the page it is a position _inside_ comes last. The capability
is named twice, and the first time is in the half of the URL that has nothing to do with
which page this is. Nobody reading that link can tell which part is the address and which
part is the scroll.

That is cosmetic. What follows from it is not. The query is the half of a URL that does
not move when the fragment does, so a position parked there outlives the page it named:
follow anything in the nav and `?to=` rides along to a document that has never heard of
the heading. The viewer already fixes this by hand — `withoutPosition` strips the position,
`useRoute` keeps an `opened` ref to tell an inherited query from one a link wrote for
itself, and a `replaceState` rewrites the address behind the reader. Around 25 lines exist
to undo a consequence of putting the position in the wrong half.

The query is also the half that goes over the wire. `?to=` and `?at=` are in the request
line on every reload and survive into the `Referer` when a rendered document links out, so
capability and change names — which is what those anchors are prefixed with — leave the
machine. A fragment never does.

This is **plumbing**, with one visible consequence: the shape of every link the copy button
produces.

## What Changes

- **A position moves into the fragment, after the route it belongs to.** `?to=` and `?at=`
  keep their names and their meanings; they change sides.

  ```
  before   /?at=store-cart-SC-01#/change/add-guest-checkout/specs
  after    /#/change/add-guest-checkout/specs?at=store-cart-SC-01
  ```

- **Route and position now move together, so the scrubbing goes.** `withoutPosition`, the
  `replaceState` in `useRoute` and the `opened` ref that decided when to fire it are all
  deleted. A position cannot be inherited by the next page, because writing the next page's
  address overwrites it in the same string.
- **The real query is left holding only what should survive a navigation.** `?mode`,
  `?board` and `?filter` are readings the link was written for and last the visit; they
  stay exactly where they are. Today they share a bag with positions that must _not_
  survive, and the two are told apart at runtime.
- **A link written in the old shape still lands.** On load, a `?to=` or `?at=` in the real
  query is honoured once and the address is rewritten into the new shape, so a link already
  pasted into a task or a PR opens on the thing it named. Nothing in the app writes that
  shape any more.
- **Not moving the route into the query.** That was the alternative considered — it is
  where the inside-out reading first points — and it is rejected: it would make every
  internal link a full page reload unless intercepted, and it would put the route on the
  wire rather than taking the position off it. Recorded in design.md so the reasoning is
  citable rather than re-litigated.

## Capabilities

### New Capabilities

- `addressing`: how the viewer addresses what is on screen — which half of the URL carries
  the page, which half carries a position inside it, which parts survive a navigation and
  which leave with the page they named, and what the copy button puts on the clipboard.
  The rules exist and are enforced across seven files today; this is the first spec that
  writes them down.

### Modified Capabilities

None. The store's one baseline, `catalog`, is about the capability index and is
untouched by this.

## Impact

- `src/toc.js` — `headingLink` and `absoluteLink` assemble the new shape; `linkedHeading`
  reads a fragment rather than a query; `withoutPosition` is deleted.
- `src/api.js` — `routeFrom` splits a position off the hash before reading segments, and
  returns it alongside `view`/`arg`/`tab`. The stale-query branch of `useRoute` and its
  `opened` ref go, replaced by the one-time rewrite of an old-shape link.
- `src/spec.js` — `linkedScenario` reads the fragment.
- `src/components/ScenarioRef.jsx` — `target()` writes `#…?at=` instead of `?at=…#…`.
- `src/components/WithOutline.jsx`, `src/components/SpecText.jsx` — read the position from
  the new place; the scroll and `markSection` behavior is unchanged.
- `src/components/CopyLink.jsx` — takes the position, not a pre-built query string.
- `src/views/ChangeDetail.jsx`, `src/views/Catalog.jsx` — `tabAsked` and the catalog's
  `tabForAnchor` call read the position from the route rather than from
  `window.location.search`.
- `test/toc.test.mjs`, `test/route.test.mjs`, `test/spec.test.mjs` — the shapes these pin
  are the change; plus cases for a route carrying a position, and for an old-shape link.
- `README.md` — "A position leaves with the page it named", the copy-button section and the
  `?at=` references describe the old arrangement in some detail.
- `CONTEXT.md` — **position** as a term, if it is not already one.

## Non-goals

- **Writing to the store.** Permanently out of scope: every claim and checkmark is a commit
  made by the CLI, and a viewer that could write would break the convention it exists to
  show.
- **History routing** — real paths like `/spec/storefront/checkout`. It is the genuinely
  conventional address, and it needs a server rewrite rule on whatever serves the built
  bundle. Hash routing is what lets the bundle be served from anywhere, and that trade is
  not being reopened here.
- **Moving the route into the query.** See above; the reasoning is in design.md.
- **Changing anchor slugs.** `slugify`, the `<prefix>--<slug>` scheme and `scenarioAnchor`
  are untouched — an old link fails or lands on the same id it always did.
- **New kinds of position.** A line number, a text range, a highlighted requirement: a
  heading and a scenario stay the only two things addressable.
- **Removing the old-shape reader.** It ships with this change and stays until a later one
  decides pasted links have aged out.
