## Context

See proposal.md — Why. What matters here is what already exists at the seam.

`capabilityCatalog()` in `server/catalog.mjs` walks the in-flight changes, then the
archive, then `openspec/specs/`, and returns one entry per capability with its baseline
counts, its last commit, and a `history` of every change that touched it — each entry
carrying `kinds`, `archived`, `at` and `archivedOn`, newest first. Everything this change
needs is in that walk already; nothing here adds a directory read or a git spawn.

`/api/specs` is fetched with `poll: false`, so the catalog is built once per page load
rather than on a timer. That is the budget: one build, already spending one `git log` per
change directory and one per baseline.

`collisions()` lives beside it and answers the same question from the other end — it walks
the in-flight changes again and reports capabilities more than one of them deltas. The
board's collision tile is its only caller.

## Goals / Non-Goals

**Goals:**

- Keep the seam where it is: the server decides what a capability *is*, the view decides
  how a list of them is arranged.
- Add no directory read and no git spawn to building the catalog.
- Leave `spec/<id>` — `SpecDetail`, `ChangedBy`, the timeline, the outline rail — untouched.

**Non-Goals:**

- Reworking `collisions()` or the board's collision tile. They keep their own path.
- A shared "namespace" concept anywhere but the catalog. If the board ever wants one, it
  can derive it the same way.

## Decisions

### `state` is computed on the server; the namespace is derived in the view

`capabilityCatalog()` gains two fields per capability: `state`, one of `shipped`,
`unshipped` or `retired`, and `inFlight`, the count of `history` entries with
`archived: false`.

`state` belongs on the server because `retired` is an inference about the store, not about
a list. Deciding it means ordering deltas newest-first, and that ordering already has a
subtlety the server owns: `at` is the commit that moved the change, which is null in a
store with no git history, so `archivedOn` — the archive directory's date prefix — is the
fallback, exactly as `shippedOn()` already does for the archive. Putting that in a
component would copy store semantics into the browser and give the fallback a second home
to drift from.

*Rejected: deriving `retired` in the view.* The payload already carries `kinds` per history
entry, so it is possible. It would also mean the browser reimplementing the date fallback,
and the next reader of `Catalog.jsx` inheriting a rule about archive directory names.

The **namespace** goes the other way and is derived in the view, from
`cap.lastIndexOf("/")`. It is a pure function of a string the payload already sends; a
`namespace` field would be a second copy of the same fact, and the server would then own a
grouping decision that is entirely about arranging a list.

### Contested is counted from `history`, not read from `collisions()`

Two in-flight changes deltaing one capability is exactly `history.filter(h => !h.archived)`
having length above one — a list `capabilityCatalog()` has already assembled. Calling
`collisions()` from the catalog would walk every in-flight change and re-parse its deltas a
second time, doubling the read to learn something already in hand.

*Rejected: having `/api/specs` return `collisions()` alongside the catalog.* Same cost, and
it leaves two representations of one fact on the same payload for a view to reconcile.

The two must not drift, so a test asserts that on one fixture the capabilities the catalog
marks contested are exactly the capabilities `collisions()` reports. If someone later
changes what counts as a collision, that test fails rather than the two views quietly
disagreeing.

### The state rule is a pure function, so it can be tested without a store

`capabilityCatalog()` calls `resolveRoot()` itself and takes no store path, unlike
`collisions(storePath, changeIds)` — so it cannot be pointed at a temp fixture the way
`collisions.test.mjs` points at one. Rather than thread a path through it, the rule comes
out as `capabilityState({ shipped, history })`, a pure function over the entry
`capabilityCatalog()` has already built: no disk, no git, testable from plain objects. Every
edge in the spec — removed-then-added, removed-with-baseline, no dates to order by — is then
a one-line case.

The temp store stays for one test only: the drift check against `collisions()`, which needs
a real store because that is the signature `collisions()` has.

*Rejected: giving `capabilityCatalog()` a store-path parameter.* A wider change than this
one needs, and it would leave two ways to resolve a root in a module whose whole job is that
there is one.

### Namespace groups flow with CSS multi-column, not grid

Reading order is the whole point of grouping, and it is what a grid gets wrong: a
`grid-template-columns: repeat(2, …)` fills left-to-right, so an alphabetical list reads
`a b / c d` across the rows instead of down the columns. CSS multi-column
(`column-width: 22rem`) flows top-to-bottom and then to the next column, which keeps the
alphabetical scan intact, and picks its own column count from the available width.
`break-inside: avoid` on the row keeps a row from splitting across the fold.

The columns apply per namespace group, not across the whole list, so a group of one does
not leave empty cells beside it and no column boundary ever falls inside a group.

*Rejected: a grid with `auto-fit`.* Same left-to-right flow problem; getting down-column
order out of grid needs an explicit row count, which needs measurement in JS.

*Rejected: a grid/list mode toggle.* It is state, and this viewer holds none: a reader who
opens someone else's link would land in a layout they did not choose, and the mode would
have to persist somewhere a read-only tool has no business writing. The window already
carries the signal the toggle would ask for.

### The row is layout in `app.css`; everything visual stays Astryx

Astryx has no row or section-header primitive, so the namespace header, the row grid and
the columns join `.status-strip` and `.timeline` as layout rules in `app.css` — the same
line this repo already draws. Every colour, size and weight comes from a token or an
Astryx component: the chips are `Badge`, and a contested capability takes the same
`warning` variant the board already uses for collisions, so one hazard reads as one colour
across both pages.

### `ChangedBy` loses its `compact` mode

`compact` exists only because the index rendered the timeline; with the index no longer
calling it, `ChangedBy` and `Entry` have a single caller and the prop and its branches
come out. That is the change shrinking, not spreading.

## Risks / Trade-offs

- **A store whose archive predates its git history has no commit dates to order deltas by**
  → the archive directory's date prefix orders them, the same fallback `shippedOn()` uses.
  A fixture with an uncommitted store covers it, since that is the case where every `at` is
  null and the sort would otherwise be arbitrary.
- **A capability renamed away, not removed, still reads as unshipped** → RENAMED is not
  REMOVED, so it does not make a capability retired. Left as-is deliberately: a rename
  leaves the old name in a state the store does not really describe, and guessing at it
  would be the confidently-wrong inference this change is trying to avoid.
- **`retired` is a new word for a state the store never names** → it is read off deltas the
  store wrote and nothing else, and a capability whose REMOVED delta is followed by a
  later ADD is not retired. The alternative is what stands today, which calls withdrawn
  behavior "in flight".
- **Dropping the timeline removes information from a page some reader may have been using**
  → it moves rather than disappears, and `spec/<id>` shows more of it than the index ever
  did. Every row still opens onto it.
- **A namespace can grow past a screen on its own** — `checkout` is already eleven —
  → columns absorb it at width, and the group header states the count so the reader knows
  what they are scrolling. A filter is the answer at several hundred capabilities, and
  adding it now would hide whether the grouping worked.

## Migration Plan

None. The catalog is read-only over a store the change does not touch, `/api/specs` gains
two fields and drops none, and any store the viewer can read today it can read after. A
rollback is a revert.
