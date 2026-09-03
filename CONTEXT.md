# openspec-viewer

A read-only dashboard over an OpenSpec store. Most of its vocabulary is OpenSpec's own —
stores, changes, capabilities, claims — and a smaller set is the viewer's, for the things
it infers or surfaces that the store does not name itself. This file is the glossary for
both; it is not a spec and carries no implementation detail.

## Language

### The store

**Store**:
The git repository an OpenSpec plan lives in — every change, spec and claim in one clone
a team pushes to and pulls from.
_Avoid_: repo, project, workspace

**Origin**:
The directory the viewer was started in, and the only input it uses to decide which store
it is reading.
_Avoid_: root, target, cwd

**Sync state**:
How far the store clone has drifted from its remote — behind, ahead, uncommitted, or up
to date. Because every claim is a commit, drift means the board is showing a plan the
rest of the team cannot see.
_Avoid_: git status, freshness, health

### A change

**Change**:
One unit of planned work, from proposal to archive. It is the thing that is claimed,
built and shipped.
_Avoid_: PR, ticket, epic, feature

**In development**:
A change that has been created and not yet archived. The board shows exactly these.
_Avoid_: open, active, WIP, in flight

**Planning**:
An in-development change with no task list yet, so there is nothing to claim or check off.
_Avoid_: draft, backlog, todo

**Shipped change**:
An archived change, kept whole as the record of what shipped and who owned each part.
_Avoid_: closed change, completed change, done

**Archiving**:
Retiring a finished change into the archive and folding its deltas into the baseline.
It is PM's call, made once the change is released rather than when it merges.
_Avoid_: closing, merging, completing

**Artifact**:
One document a change carries — its proposal, design, task list, ui spec, or spec
deltas.
_Avoid_: doc, file, page, deliverable

**Workflow schema**:
The named set of artifacts a change was created under. It decides which artifacts the
change is supposed to have and the order they are read in; two changes in one store can
sit on different schemas.
_Avoid_: template, workflow, preset, type

**Completeness**:
Which of the artifacts a change's schema asked for have actually been written.
_Avoid_: coverage, progress, health

### Capabilities and specs

**Capability**:
A named unit of behavior the store owns, described by exactly one spec.
_Avoid_: feature, module, component, area

**Spec**:
The text describing one capability's behavior, written as requirements and scenarios.
_Avoid_: specification, doc, contract

**Requirement**:
A single normative statement about what a capability SHALL do.
_Avoid_: rule, criterion, must

**Scenario**:
A Given/When/Then example that makes a requirement checkable.
_Avoid_: test case, acceptance criteria, example

**Step**:
One WHEN / THEN / AND line of a scenario.
_Avoid_: line, clause, statement

**Namespace**:
Everything in a capability's path before its last segment — `shared-ui` in
`shared-ui/cart`. The store's own grouping, written by whoever named the capability,
what the catalog is ordered by, and a page of its own: it holds every capability and
every change at it or below it.
_Avoid_: domain, area, prefix, folder, group

**Baseline**:
A capability's shipped spec — its behavior as it stands, before any in-development change
rewrites it.
_Avoid_: main spec, current spec, source of truth

**Delta**:
A change's edit to one capability's spec, marked ADDED, MODIFIED, REMOVED or RENAMED, or
introducing the capability as new.
_Avoid_: diff, patch, spec change, override

**Shipped capability**:
A capability that has a baseline. One first named by an in-development change is unshipped and
has no baseline text to read yet.
_Avoid_: existing, live, released

**Retired capability**:
A capability with no baseline whose newest delta did nothing but remove — behavior the
store withdrew, rather than behavior a change has yet to bring in. The two look identical
in the tree, and calling a retired capability unshipped points a reader at work nobody is
doing.
_Avoid_: deleted, deprecated, dropped, archived capability

**Changed by**:
The changes that have touched one capability, in development or archived, newest first.
_Avoid_: history, provenance, log

### Work and ownership

**Task group**:
A numbered, separately owned section of a change's task list. It is the unit that gets
claimed.
_Avoid_: phase, section, milestone, chunk

**Task**:
One checklist item in a group — work small enough to finish in a sitting, checked off in
a commit.
_Avoid_: subtask, item, step

**Claim**:
A person's name on a task group, taken when they pick it up and recorded as a commit. An
unpushed claim is not a claim.
_Avoid_: assignment, lock, reservation

**Owner**:
The person a group is claimed by. A group with none reads as unassigned, which is a state
rather than missing data.
_Avoid_: assignee, holder, lead

**Unclaimed**:
An open group with no owner — work anyone can take.
_Avoid_: free, available, backlog

### What the viewer infers

Two facts nothing in the store states outright, and the reason the viewer exists beside
the CLI.

**Idle claim**:
A claimed, unfinished group where neither the claim nor the last checkmark is recent — a
name on work nobody is doing.
_Avoid_: stalled, blocked, abandoned, at risk

**Quiet**:
An idle claim past three days: worth asking about in standup.
_Avoid_: warning, aging

**Stale**:
An idle claim past seven days: either pick it back up or hand it back so someone else
can take it.
_Avoid_: critical, dead, overdue

**Conflict**:
Two in-development changes deltaing the same capability. Git never flags it — each change
is its own folder — and it breaks at archive time, when the second change is written
against a baseline the first already rewrote. Never a git conflict, which is the one thing
the word must not be read as: say "git will never flag it", not "it never conflicts".
_Avoid_: collision, overlap, clash, merge conflict

**Contested**:
Of a capability: the one a conflict is happening to. The conflict is the event, the
capability is contested — the board counts the first, the catalog marks the second.
_Avoid_: conflicted, disputed, hot

**Ready to archive**:
An in-development change with every task checked off.
_Avoid_: complete, finished, done

### What it shows

**Board**:
The default view: every in-development change, its task groups, who owns each, and how long
each claim has been idle.
_Avoid_: dashboard, home, overview

**Strip**:
The five tiles across the top of the board.
_Avoid_: header, summary bar, stats row

**Tile**:
One count in the strip. Every tile reads zero when there is nothing to do, which is why
inventory counts — total specs, percent complete — are never tiles.
_Avoid_: stat, metric, KPI, card

**Queue**:
A tile that can be clicked into, narrowing the board to the work it counts. There are
four: conflicts, idle claims, ready to archive, unclaimed. The store's sync state is the
fifth tile and is not a queue.
_Avoid_: filter, bucket, category

**Catalog**:
The index of every capability, grouped by namespace, with its size and whether a change is
rewriting it. Not which changes have touched it — that is the capability's own page.
_Avoid_: list, browser, directory

**Timeline**:
A dated sequence read down one column — a capability's history, or the archive.
_Avoid_: feed, log, activity

**Outline rail**:
The "On this page" list of headings beside whatever artifact is on screen.
_Avoid_: TOC, sidebar, index

**Doc**:
A markdown file in the store outside its OpenSpec directory — a PRD or ADR a spec links
to — served so those links resolve to a page instead of a dead end.
_Avoid_: page, external doc, attachment

**Search**:
Reading every markdown file under the store's OpenSpec directory for a phrase. Not an
index and not a ranking: the store is three megabytes, it is read on each query, and what
the results are ordered by is where each hit lives rather than how well it scored.
_Avoid_: find, query, lookup, full-text search

**Hit**:
One line of one document holding the phrase, at the line number it sits on. A document
with twelve of them is one result carrying twelve hits, not twelve results.
_Avoid_: match, occurrence, result

**Scope**:
Which of the store's three places a hit is in: production, in development, or shipped.
The words are the nav's own, because a result is a thing to click and it is filed under
the row the reader would otherwise have clicked to reach it.
_Avoid_: source, section, area, kind

**Completion**:
A name the search box offers while you type — a capability or a change in development,
opening its page. The store's own names, never a phrase out of its text: what completes is
exactly what can be navigated to.
_Avoid_: autocomplete, suggestion, typeahead, hint
