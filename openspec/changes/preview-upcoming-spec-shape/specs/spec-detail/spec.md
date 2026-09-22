## Purpose

The page for one capability — its shipped baseline in full, every change that has ever
touched it, and, for a capability at least one in-development change deltas, what it will
read like once those changes land.

## ADDED Requirements

### Requirement: A shipped capability's baseline is shown in full

A capability with a baseline in `openspec/specs/` SHALL show that baseline's requirements
and scenarios in full on its own page.

#### Scenario: A shipped capability

- **GIVEN** a baseline at `openspec/specs/storefront/pricing/spec.md`
- **WHEN** `spec/storefront/pricing` is read
- **THEN** the page shows every requirement and scenario the baseline holds

#### Scenario: An unshipped capability

- **GIVEN** a capability only an in-development change deltas, with no baseline
- **WHEN** its page is read
- **THEN** the page says it is not shipped yet, and names the change that introduces it

### Requirement: Every change that touched the capability appears, newest first

The page SHALL list every change that has deltaed the capability — in development or
archived — newest first, and SHALL state whether each is still in development or shipped.

#### Scenario: A capability with a mixed history

- **GIVEN** `storefront/pricing`, deltaed by two archived changes and one in-development one
- **WHEN** its page is read
- **THEN** all three appear, the in-development one first if it is the most recent

#### Scenario: A capability with no history

- **GIVEN** a capability no change in the store touches
- **WHEN** its page is read
- **THEN** the page says no change touches it

### Requirement: A capability with an in-development change offers an Upcoming view

The page SHALL offer a Durable / Upcoming toggle whenever at least one in-development
change deltas the capability, and SHALL NOT offer it otherwise.

#### Scenario: A quiet capability

- **GIVEN** a shipped capability with no in-development change deltaing it
- **WHEN** its page is read
- **THEN** it shows only the durable baseline, with no toggle

#### Scenario: A capability with one in-development change

- **GIVEN** `storefront/pricing`, deltaed by exactly one in-development change,
  `adjust-storefront-pricing-tiers`
- **WHEN** its page is read
- **THEN** a Durable / Upcoming toggle appears

### Requirement: Upcoming is composite by default

Upcoming SHALL fold every in-development change deltaing the capability onto the baseline
at once, not one change at a time. A MODIFIED or REMOVED block is matched to the baseline
requirement it names the same way `openspec archive` matches it: by its `### Requirement:`
heading, whitespace- and case-insensitive. An ADDED block with no match in the baseline is
appended.

#### Scenario: Two changes on disjoint requirements

- **GIVEN** `storefront/pricing` deltaed by `adjust-storefront-pricing-tiers`, which
  MODIFIEs "Tier thresholds are configurable", and `add-bulk-discount-pricing`, which ADDs
  "Bulk orders receive a volume discount"
- **WHEN** Upcoming is read
- **THEN** it shows the baseline with "Tier thresholds are configurable" rewritten and "Bulk
  orders receive a volume discount" appended, each tagged with the change that touched it

#### Scenario: An unshipped capability with two in-development changes

- **GIVEN** a capability with no baseline, ADDed in part by each of two in-development
  changes under different headings
- **WHEN** Upcoming is read
- **THEN** it shows both ADDed requirements, tagged with the change each came from, and
  states that the capability is not shipped

### Requirement: A requirement two changes both touch is a disagreement, not a merge

A requirement heading touched by more than one in-development change SHALL be shown as a
disagreement: every touching change's version of it, side by side, and SHALL NOT be folded
into a single reading.

#### Scenario: Two changes modify the same requirement

- **GIVEN** `storefront/pricing` deltaed by `adjust-storefront-pricing-tiers` and
  `retire-legacy-pricing-flag`, both under `## MODIFIED Requirements` for "Tier thresholds
  are configurable", with different resulting text
- **WHEN** Upcoming is read
- **THEN** "Tier thresholds are configurable" is shown as a disagreement holding both changes'
  versions, and neither replaces the baseline in the composite

#### Scenario: Two changes add the same heading

- **GIVEN** two in-development changes, each ADDing a requirement titled "Bulk orders
  receive a volume discount" with different text
- **WHEN** Upcoming is read
- **THEN** the heading is shown as a disagreement holding both versions, not appended twice

#### Scenario: One change modifies what another removes

- **GIVEN** `adjust-storefront-pricing-tiers` MODIFYing "Tier thresholds are configurable"
  and another in-development change REMOVEing the same requirement
- **WHEN** Upcoming is read
- **THEN** the requirement is shown as a disagreement naming both changes and what each does to
  it, rather than being silently rewritten or dropped

#### Scenario: A MODIFIED block that matches nothing in the baseline

- **GIVEN** an in-development change whose MODIFIED block's heading does not match any
  requirement in the baseline
- **WHEN** Upcoming is read
- **THEN** that block is flagged as unable to fold, the same drift the change's own page
  already warns about, and the baseline requirement it was meant to replace is shown
  unchanged

### Requirement: A reader can narrow the composite to a subset of changes

The page SHALL show one toggle chip per in-development change deltaing the capability, all
enabled by default, and SHALL recompute Upcoming from only the enabled subset when a reader
changes which chips are on.

#### Scenario: Narrowing to one change

- **GIVEN** `storefront/pricing` deltaed by two in-development changes, both enabled
- **WHEN** a reader disables one chip
- **THEN** Upcoming shows only the remaining change's delta folded onto the baseline, with
  no disagreement if the two did not touch the same requirement

#### Scenario: Disabling every chip

- **GIVEN** a capability with at least one in-development change
- **WHEN** a reader disables every chip
- **THEN** Upcoming shows the baseline exactly as Durable does
