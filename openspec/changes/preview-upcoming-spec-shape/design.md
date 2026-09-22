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
text }` for every in-development change that touches it. The client splices the
currently-enabled subset back into the baseline's own document text — see the next decision
— rather than the server sending a pre-rendered page. Rejected: recomputing the fold
server-side on every chip toggle. Toggling a chip is a checkbox click; round-tripping it
makes the one interaction this feature adds feel slower than everything else on the page,
and the fold over an already-fetched, already heading-keyed structure is cheap enough to do
in the view.

**Upcoming is spliced back into the baseline's own document text, not rendered as a
separate list of cards.** `src/upcoming.js`'s `buildUpcomingText` finds each requirement's
`### Requirement:` block inside the baseline's raw text by the same heading match, replaces
or annotates the touched ones in place, appends any ADDED-only heading after the rest, and
leaves everything else — the Purpose section, feature-set prose, requirement order — exactly
as the baseline has it. The result is one markdown string, handed to the same `SpecText`
component and wrapped in the same `Card`/`WithOutline`/`LensControl` Durable already uses, so
Upcoming is indistinguishable from Durable in layout and only differs where a touch actually
changes something. Rejected, and actually built first: one `Card` per touched requirement,
in its own flat list. Dogfooding it against this repo's own store showed the problem
immediately — no Purpose section, no outline rail, and untouched requirements left out
entirely, none of which a reader flipping the Durable/Upcoming toggle to compare the two
would expect. A marker's job is to say what changed, not to change what the page looks like.

**A REMOVED touch is marked, not struck through.** Markdown has no reliable way to strike
through a whole block of prose and scenarios — `~~like this~~` is inline-only in commonmark
and does not survive a paragraph break, let alone a heading. A solo REMOVED touch keeps the
baseline's own text exactly as it reads, with a blockquote marker naming the change and
whatever Reason/Migration text the REMOVED block itself carries appended below it. Rejected:
a CSS strikethrough class on a wrapping `<div>`, which is what the first, card-based version
of this view did — it stopped being an option once REMOVED had to render inline in the same
markdown-driven document as everything else, rather than as its own isolated component.

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

**A document beside spec.md is a whole file, not a delta — so its Upcoming reading shows
every version, not a fold.** `capabilityDocs`/`readDocs` already list and read whatever
files a capability directory holds besides spec.md — a journey, a set of test cases — and
`capabilities()` already reads a change's own copies of them the same way for the change
page. `upcomingFor` gathers those per touching change into `upcoming.docs`: one entry per
document name, `{ name, label, versions: [{ changeId, text }] }`, reusing `label()` from
`server/artifacts.mjs` rather than inventing a second name-to-label rule. `buildUpcomingDocText`
(`src/upcoming.js`) shows the shipped text and every enabled change's own copy stacked, each
marked, with a disagreement warning once more than one is enabled — no heading-matching, no
splicing, because there is no substructure to match on. Rejected: trying to diff or merge
two copies of a journey line by line. A journey is prose written by a person, not requirement
blocks with a fixed heading grammar; guessing at which lines "are the same one across two
copies" is exactly the confidently-wrong inference this feature exists to avoid, not add.

**One chip row, shared across spec.md and every document beside it, not one per tab.** A
reader picking which in-development changes to preview is answering one question — "what do
I want to see landed" — for the whole capability, not once per artifact it has. `Upcoming`
is mounted once per capability (keyed on `cap.capability`, same as before) and takes `doc` as
a prop that changes as a reader switches tabs, rather than being remounted per tab; its
`enabled` state, and the chip row itself, therefore survive a tab switch. Rejected: an
independent chip row per tab. It would let a reader disable a change on spec.md and still see
it enabled on User Journeys, silently previewing a state the change never actually produces —
spec.md's requirements and its capability's journeys either both land with a given change or
neither does, so the picker should not be able to say otherwise.

**A touched section carries a badge through a prop on `SpecText`, not a change to what it
parses.** `SpecText` (and the `Requirement` component inside it) already renders one
`<section>` per requirement off `parseSpec`'s own nodes; it now takes an optional `annotate`
function, keyed by the requirement's title, and renders a `Badge` beside that requirement's
heading when it returns a kind. `Artifact` forwards the prop; `Upcoming` is the only caller
that ever passes it, computed by a new pure `upcomingKinds(requirements, enabled)` that runs
the same touch-filtering `buildUpcomingText` does, kept separate so the text handed to a
markdown renderer never has to carry styling hints inside it.

**A document's versions render as a list of blocks, not a spliced string, so each can carry
its own badge.** Unlike spec.md there is no shared `<section>` per version — a document is
one block of prose start to finish — so `upcomingDocVersions` returns an array (`{ kind,
changeId?, text }`) instead of joining everything into one string the way `buildUpcomingText`
does, and `Upcoming` renders each entry as its own `DocVersion`, labelled and badged. This is
the per-card approach an earlier revision of this design rejected for spec.md — but it never
had the problem that revision found: there is no Purpose section or requirement order for a
document, so a version rendered as its own block loses nothing spec.md would have.

**A badge, not a tinted background.** The first cut of this gave the whole touched
`<section>` (or document version) a background too — `upcoming-block upcoming-block--<kind>`,
colored the same as the badge. Dropped: a colored block behind a full requirement's prose and
scenarios reads as heavier than the fact it is marking, especially once a disagreement's two
full versions are each their own block, and the badge alone already answers "what changed"
at a glance without also changing how the surrounding page looks. `Requirement` and
`DocVersion` still keep their own small local `kind → { label, variant }` map rather than a
shared one — two different, non-overlapping vocabularies (ADDED/MODIFIED/REMOVED/disagreement
against shipped/pending/disagreement) that only happen to share the word "disagreement" — but
neither applies a background class any more, only the `Badge` itself.

**Colors are Badge's own tokens, not a new palette.** A badge's `variant` is
`green`/`yellow`/`red` for ADDED/MODIFIED/REMOVED, `orange` for a disagreement, and `blue`
for a document's lone pending copy — the same variants `@astryxdesign/theme-neutral` already
ships Badge with, not a palette of this page's own.

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
- A disagreement's versions sit under one `### Requirement:` heading rather than one each, so
  their scenarios render in a single flattened disclosure instead of grouped per version. →
  Mitigation: each version's own marker and prose sit directly above its scenarios in the
  same block, so which is which stays visible by position; two headings for one requirement
  name would give `SpecText`'s scenario index two definitions to pick from, which its
  "first definition wins" rule is not built to disambiguate.
- A document with the shipped text plus several changes' own full copies stacked is long,
  and none of it is scoped down by a lens the way spec.md's Contract/Scenarios/Full reading
  is. → Mitigation: bounded the same way the chip row is — by how many in-development
  changes actually carry their own copy of *this* document, which real stores keep small; a
  lens for prose documents is a separate feature with its own bar to clear.
- A badge names what changed but does not draw the eye to *where* on a long page it is,
  the way a background would have. → Mitigation: accepted; see the "badge, not a tinted
  background" decision above for why the background was dropped anyway.

## Migration Plan

None. Purely additive and read-only: a store with no in-development changes on a capability
never renders the toggle, so no existing page changes for it.
