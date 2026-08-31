## Purpose

The index of every capability the store knows about — shipped, unshipped or retired —
grouped so a reader can find one by name, and marked so a capability two in-flight changes
are both rewriting cannot be mistaken for a quiet one.

## ADDED Requirements

### Requirement: Every capability appears exactly once

The catalog SHALL list every capability the store knows about — those with a baseline in
`openspec/specs/`, and those a change deltas without one — and SHALL list each exactly
once, whatever its state.

#### Scenario: A capability with a baseline and no in-flight change

- **GIVEN** a store with a baseline at `openspec/specs/shared-ui/home/spec.md`
- **WHEN** the catalog is read
- **THEN** `shared-ui/home` appears once

#### Scenario: A capability only an in-flight change names

- **GIVEN** an in-flight change deltaing `storefront/membership`, which has no baseline
- **WHEN** the catalog is read
- **THEN** `storefront/membership` appears once

#### Scenario: A store with no capabilities at all

- **GIVEN** a store with no baselines and no change deltaing a capability
- **WHEN** the catalog is read
- **THEN** the catalog reports no capabilities, and says a capability appears as soon as a
  change deltas it

### Requirement: Capabilities are grouped by namespace

A capability's namespace SHALL be everything in its path before the last `/`, and the
catalog SHALL group rows under it. A capability whose path has no `/` SHALL be grouped
under `top level`, and that group SHALL come after every named namespace. Named namespaces
SHALL be ordered alphabetically, and rows within a group alphabetically by the part of the
path after the namespace.

#### Scenario: A namespaced capability

- **GIVEN** capabilities `shared-ui/cart` and `shared-ui/home`
- **WHEN** the catalog is read
- **THEN** both sit under a `shared-ui` group, shown as `cart` then `home`

#### Scenario: A nested namespace

- **GIVEN** a capability `admin/console/user-directory`
- **WHEN** the catalog is read
- **THEN** it sits under an `admin/console` group, shown as `user-directory`

#### Scenario: A capability with no namespace

- **GIVEN** capabilities `date-formats` and `shared-ui/cart`
- **WHEN** the catalog is read
- **THEN** `date-formats` sits under `top level`, and that group comes after `shared-ui`

#### Scenario: A store where nothing is namespaced

- **GIVEN** a store whose every capability path has no `/`
- **WHEN** the catalog is read
- **THEN** the rows are listed without a group header, since `top level` would be the only
  group and would name nothing the reader cannot already see

#### Scenario: Each group states how many capabilities it holds

- **GIVEN** a `shared-auth` namespace holding seven capabilities
- **WHEN** the catalog is read
- **THEN** the `shared-auth` group is labelled with the count 7

### Requirement: A row states what the capability is and how big it is

Each row SHALL state the capability's name within its namespace. A capability with a
baseline SHALL state how many requirements and scenarios that baseline holds, and when the
baseline last changed. One without a baseline SHALL say it has none rather than report a
count of zero.

#### Scenario: A shipped capability

- **GIVEN** a baseline holding 5 requirements and 20 scenarios, last committed 3 days ago
- **WHEN** its row is read
- **THEN** the row states 5 requirements, 20 scenarios, and that it changed 3 days ago

#### Scenario: A capability with no baseline

- **GIVEN** a capability that only an in-flight change deltas
- **WHEN** its row is read
- **THEN** the row says it has no baseline, and states no requirement or scenario count

#### Scenario: A store with no git history

- **GIVEN** a store whose files are not committed, so no capability has a last-changed commit
- **WHEN** the catalog is read
- **THEN** every row still states its name and counts, and states no age rather than a
  fabricated one

#### Scenario: A baseline with no requirements

- **GIVEN** a baseline file holding prose but no `### Requirement:` heading
- **WHEN** its row is read
- **THEN** the row states 0 requirements and 0 scenarios, and the capability is still shipped

### Requirement: A capability is shipped, unshipped or retired

The catalog SHALL report exactly one state per capability. A capability with a baseline is
**shipped**. One with no baseline whose newest delta is REMOVED is **retired** — behavior
the store withdrew. One with no baseline that is not retired is **unshipped** — behavior a
change is still bringing in. The catalog SHALL NOT report a retired capability as
unshipped.

#### Scenario: A retired capability

- **GIVEN** `shared-ui/user-directory`, added by one archived change and REMOVED by a
  later one, with no baseline
- **WHEN** its row is read
- **THEN** the row says the capability is retired

#### Scenario: A capability removed and then reintroduced

- **GIVEN** a capability whose REMOVED delta is older than a later change that ADDs it again
- **WHEN** its row is read
- **THEN** the row says it has no baseline, not that it is retired

#### Scenario: A removed capability whose baseline still exists

- **GIVEN** a capability with a REMOVED delta in an in-flight change and a baseline still in
  `openspec/specs/`
- **WHEN** its row is read
- **THEN** the row reports it as shipped, with its baseline counts

#### Scenario: Deltas with no dates to order

- **GIVEN** a retired capability in a store with no git history, so no delta carries a
  commit date
- **WHEN** its row is read
- **THEN** the archive date in each change's directory name orders the deltas, and the
  capability is still reported as retired

### Requirement: A contested capability is marked as one

A capability that two or more in-flight changes delta is **contested**: at archive time the
second change is written against a baseline the first already rewrote, and nothing else in
the store says so. Each row SHALL state how many in-flight changes are deltaing it when
there is at least one, and a contested row SHALL be distinguishable from a row with a
single in-flight change without reading the number.

#### Scenario: One in-flight change

- **GIVEN** `storefront/product-page` deltaed by exactly one in-flight change
- **WHEN** its row is read
- **THEN** the row says the capability is in flight

#### Scenario: Two in-flight changes

- **GIVEN** `storefront/pricing` deltaed by two in-flight changes
- **WHEN** its row is read
- **THEN** the row says two changes are in flight, and is marked as contested rather than
  as in flight

#### Scenario: Archived changes do not contest

- **GIVEN** a capability deltaed by four archived changes and no in-flight change
- **WHEN** its row is read
- **THEN** the row is not marked, and states no in-flight count

### Requirement: The index summarises the store before listing it

The catalog SHALL open with how many capabilities the store holds and how many are
shipped, unshipped, retired and contested. A count that is zero SHALL be omitted rather
than shown as zero, so the summary only ever names states the store is actually in.

#### Scenario: A store in every state

- **GIVEN** 51 capabilities — 33 shipped, 16 unshipped, 2 retired, 1 of them contested
- **WHEN** the catalog is read
- **THEN** the summary states 51 capabilities, 33 shipped, 16 unshipped, 2 retired and 1
  contested

#### Scenario: A store with nothing contested

- **GIVEN** a store where no capability has more than one in-flight change
- **WHEN** the catalog is read
- **THEN** the summary omits the contested count entirely

### Requirement: The index carries names, not histories

The catalog SHALL NOT render a capability's changed-by timeline. Which changes touched a
capability is what `spec/<id>` is for, and repeating it per row makes the one capability a
reader wants the hardest to find. The index SHALL carry only the part that changes what a
reader does next: that a change is rewriting the capability now.

#### Scenario: A capability with a long history

- **GIVEN** `shared-ui/product-listing`, touched by seven archived changes
- **WHEN** its row is read
- **THEN** the row names none of the seven, and states no dates other than when the
  baseline last changed

#### Scenario: The history is still one click away

- **GIVEN** any capability in the catalog
- **WHEN** its row is opened
- **THEN** `spec/<id>` shows every change that touched it, in flight and archived, newest
  first
