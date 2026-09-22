## Context

See `proposal.md` - Why for the motivation. Two things already in the codebase this design
builds on:

- `server/change.mjs`'s `capabilities(storePath, changeId)` already reads, for one
  in-development change, every capability it deltas: the raw delta text, its `kinds`
  (ADDED/MODIFIED/REMOVED/RENAMED), and `drift` — whether a MODIFIED block's heading fails
  to match the shipped baseline. It is plain `fs` reads, no git spawn, and already runs on
  every change page.
- `server/deltas.mjs`'s `modifiedRequirements`/`modifiedDrift` match a MODIFIED block to a
  baseline requirement by its `### Requirement:` heading, whitespace- and case-insensitive —
  the same matching `openspec archive` does. Today it only compares one delta to the
  baseline.

`/api/spec` is fetched once per `spec/<id>` page load, not polled (`SpecDetail` passes
`poll: false`) — the durable payload is stable while a reader is looking at it.

## Goals / Non-Goals

**Goals:**
- Compute, server-side, one composite view per capability: the baseline plus every
  in-development change's delta, grouped by requirement heading with a disagreement called out
  wherever more than one change touches the same heading.
- Let the client re-derive the fold for any subset of the in-development changes (the chip
  row) from data already on the page, with no further request.

**Non-Goals:**
- Reproducing `openspec archive`'s exact fold byte-for-byte, including where an ADDED
  requirement lands in the feature-set outline. Out of scope per `proposal.md`.
- Detecting a disagreement by comparing resulting text for equality. See Decisions.

## Decisions

**The composite lives on `/api/spec`, not a new route.** `SpecDetail` already fetches
`/api/spec?id=<capability>` once per page load. Computing the composite costs a handful of
extra `fs` reads — one per in-development change touching the capability, already paged
through `capabilities()` — so folding it into the existing response avoids a second round
trip. Rejected: a sibling `/api/spec-upcoming` route, fetched lazily when a reader opens the
Upcoming tab. That would save the read for a reader who never opens it, but the cost is
small and bounded by how many in-development changes exist in the store (tens, not
thousands), and a second route means `SpecDetail` either double-fetches on mount or has to
gate a second loading state behind the toggle for a saving that doesn't show up on a poll
anywhere.

**The response is per-requirement raw data, not a pre-rendered fold.** For every
requirement heading the baseline holds, plus every heading only an ADDED block introduces,
`/api/spec` returns the baseline text (or `null`) and a list of `{ changeId, operation,
text }` for every in-development change that touches it. The client computes which spans
are active, which are disagreements, and what Upcoming reads like for the currently-enabled
chip subset. Rejected: recomputing the fold server-side on every chip toggle. Toggling a
chip is a checkbox click; round-tripping it makes the one interaction this feature adds feel
slower than everything else on the page, and the fold over an already-fetched, already
heading-keyed structure is cheap enough to do in the view.

**A disagreement is keyed on heading touched by ≥2 changes, not on text equality.** Two
changes both touching "Tier thresholds are configurable" are a disagreement whether or not
their resulting text happens to be identical. Rejected: comparing resulting text and only
flagging a real divergence. Byte-equal text can still differ in ways a reader cares about
(a scenario added under one otherwise-identical requirement, say), and `catalog`'s own
`contested` state already set the precedent of flagging on touch-count alone (see
`openspec/specs/catalog/spec.md` - "A contested capability is marked as one"). This design
follows it rather than introducing a second, finer notion of "actually conflicting."

**Drift stays exactly where it is.** A MODIFIED block whose heading matches nothing in the
baseline already surfaces via `capabilities()`'s existing `drift` field. The composite
response lists such a change under a separate "could not fold" set for the capability
rather than inventing a second drift check — `modifiedDrift` is reused unchanged.

**The N-way grouping is a new module, not an addition to `deltas.mjs`.** `deltas.mjs`
answers one question — will this one delta's MODIFIED block fold — and the drift check is
useful with only a change and a baseline in hand. Grouping every in-development change's
deltas on a capability by heading is a different question, asked from a different place
(`/api/spec`, not `/api/change`), so it gets its own module (working name
`server/upcoming.mjs`) that imports `key()`-style matching from `deltas.mjs` rather than
extending its exports.

## Risks / Trade-offs

- Two changes MODIFYing the same heading to text that turns out identical still renders as
  a disagreement → a reader sees a warning for something that would fold cleanly. → Mitigation:
  accepted false positive, same precedent as `contested`; a text-equality short-circuit can
  be added later without changing the response shape.
- The composite is a guess at what `openspec archive` will actually do, not a guarantee —
  same caveat `modifiedDrift`'s own comment already carries. → Mitigation: state it on the
  Upcoming banner, same tone as the existing per-MODIFIED drift warning on the change page.
- A capability with many in-development changes makes for a wide chip row. → Mitigation:
  chips wrap; the set is bounded by how many changes touch *this* capability, not the whole
  store.

## Migration Plan

None. Purely additive and read-only: a store with no in-development changes on a capability
never renders the toggle, so no existing page changes for it.
