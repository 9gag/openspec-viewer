## Why

`spec/<id>` shows a capability's shipped baseline and, below it, the list of changes that
have touched it. What it never shows is what the capability will read like once those
still in development actually land. A reader who wants that has to open each in-development
change in turn, read its raw ADDED/MODIFIED/REMOVED blocks, and merge them onto the
baseline in their head — and when two changes touch the same capability, there is nowhere
that says whether they touch the *same* requirement or two different ones. `storefront/pricing`
deltaed by two in-development changes reads, on `spec/<id>` today, exactly like a capability
with one.

This is presentation over an inference the store doesn't compute yet. The fold itself —
lining a delta's `### Requirement:` block up against the baseline by heading — already
exists in `server/deltas.mjs`, used today only to warn that a MODIFIED block won't match
anything at archive time. What's missing is doing that same match for every in-development
change on a capability at once, well enough to tell "these two changes touch different
requirements, both are safe to show together" apart from "these two touch the same one, and
disagree." The second case is real inference and is held to that bar: shown wrong, it reads
as a decision nobody made.

## What Changes

- `spec/<id>` gains a Durable / Upcoming toggle, shown whenever at least one in-development
  change deltas the capability.
- Upcoming defaults to **composite**: every in-development delta on the capability is folded
  onto the baseline at once, not one change at a time — there is no landing order to
  reflect, so none is invented by folding one change's result into the next.
- Each requirement the composite touches is tagged with the change that touched it, so a
  reader can tell which of what they're reading is durable and which is still moving.
- A requirement two or more in-development changes both touch is a **disagreement** and is
  never merged into one reading: it renders as a callout holding every change's version
  side by side, whether both changes MODIFY it, both ADD it under the same heading, or one
  MODIFIEs while another REMOVEs it.
- A row of toggle chips, one per in-development change touching the capability, lets a
  reader narrow the composite down to a subset — down to one chip, that subset is the
  single-change preview the composite generalizes. The row is shared across spec.md and
  every document filed beside it, so a chip's state does not change when a reader switches
  tabs.
- A document beside spec.md — a journey, a set of test cases — gets its own Upcoming
  reading. It is not a delta, so there is nothing to fold paragraph by paragraph: an
  in-development change's own copy is shown in full, alongside the shipped version, marked
  as not yet shipped; two changes each carrying their own copy disagree the same way two
  requirements can.

## Capabilities

### New Capabilities

- `spec-detail`: the per-capability detail page (`spec/<id>`) — what a shipped baseline
  shows, its changed-by history, and now the Durable/Upcoming split described above. First
  spec written for this page, so it also fixes the baseline shape everything else in this
  change is a delta against.

### Modified Capabilities

None. This store has no baseline for `spec/<id>` yet.

## Impact

- `server/deltas.mjs` — `modifiedRequirements`/`modifiedDrift` generalize from one delta
  against a baseline to every in-development delta on a capability against the baseline and
  against each other, to find disagreements rather than only drift.
- `server/catalog.mjs` — `conflicts()` stays as it is: a capability-level signal for the
  board and the index. The requirement-level disagreement this change needs is finer-grained
  and lives beside the new fold, not inside it.
- A new read on `/api/spec` (or a sibling route) returns the composite: baseline text, the
  fold applied, which change touched which requirement, and the disagreement list. Exact
  shape is `design.md`'s call.
- `src/views/Catalog.jsx` — `SpecDetail` gains the toggle and passes the active tab's
  document, if any, to a single `Upcoming` component that outlives tab switches; `SpecBody`
  and `ChangedBy` are unchanged.
- `server/artifacts.mjs` — `label()` is reused, not duplicated, for a document's name only
  `upcoming.docs` carries.
- `test/` — fixtures for a capability with one in-development change (composite equals the
  single-change case), two changes on disjoint requirements (both fold in cleanly), and two
  changes disagreeing on the same requirement in each of the three ways above.
- `CONTEXT.md` — **composite** and **disagreement** join the store's vocabulary.
- `README.md` — the `spec/<id>` screenshot and its description.

## Non-goals

- **Writing to the store.** Permanently out of scope: every claim and checkmark is a commit
  the CLI makes, and a viewer that could write would break the convention it exists to show.
- **Sequencing disagreements**, or guessing which of two disagreeing changes should archive
  first. The composite names a disagreement; deciding it stays PM's call, as it already is on
  the board and in the catalog.
- **A general N-way text merge.** The fold only ever matches on the same heading the CLI's
  own archive-time fold matches on; anything looser is a different, riskier feature.
- **Touching the catalog index.** `catalog`'s per-row `contested` marker and count are
  unchanged; this change is entirely inside `spec/<id>`.
