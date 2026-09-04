## Purpose

How the viewer addresses what is on screen: which half of the URL carries the page, which
half carries a position inside it, what survives a navigation and what leaves with the page
it named — so a link a reader copies opens on the thing they were pointing at, and a link
they follow does not claim they are somewhere they are not.

## ADDED Requirements

### Requirement: The page is named in the fragment

The address of a page — its view, its argument, and which of its tabs is open — SHALL be
carried in the URL fragment and nowhere else. The viewer SHALL NOT write the view, the
argument or the tab into the query string.

A fragment that does not begin with `/` is not a route: the viewer SHALL leave the page it
is showing alone rather than treat it as a view, since a bare fragment is an anchor.

#### Scenario: A capability's page

- **GIVEN** the capability `storefront/checkout`
- **WHEN** its address is written
- **THEN** it is `#/spec/storefront%2Fcheckout`, and the query is empty

#### Scenario: A change opened on one of its tabs

- **GIVEN** the change `add-guest-checkout` with its tasks open
- **WHEN** its address is written
- **THEN** it is `#/change/add-guest-checkout/tasks`

#### Scenario: A fragment that is an anchor rather than a route

- **GIVEN** an address whose fragment is `#purpose`
- **WHEN** it is read as a route
- **THEN** it names no route, and the page already on screen is kept

### Requirement: A position rides in the fragment, after the route

A position inside a page — `to` for a heading, `at` for a scenario — SHALL be written into
the fragment after the route it belongs to, in query syntax: `#<route>?to=<heading>`. Both
values SHALL be percent-encoded, so a route argument that contains a `/`, a `?` or a space
cannot be mistaken for the position or for a further route segment.

Reading an address SHALL yield the route and the position separately, and a route read from
an address that carries a position SHALL be identical to the same route read without one.

#### Scenario: A heading on a capability's page

- **GIVEN** the heading `storefront/checkout--purpose` on the page for `storefront/checkout`
- **WHEN** its address is written
- **THEN** it is `#/spec/storefront%2Fcheckout?to=storefront%2Fcheckout--purpose`

#### Scenario: A scenario on a change's specs tab

- **GIVEN** the scenario `store-cart-SC-01` on the specs tab of `add-guest-checkout`
- **WHEN** its address is written
- **THEN** it is `#/change/add-guest-checkout/specs?at=store-cart-SC-01`

#### Scenario: The route survives the position beside it

- **GIVEN** the address `#/spec/storefront%2Fcheckout?to=purpose`
- **WHEN** it is read as a route
- **THEN** the view is `spec` and the argument is `storefront/checkout` — the position is no
  part of either

#### Scenario: A heading whose text encodes to something route-shaped

- **GIVEN** a heading whose slug contains `/` or `?`
- **WHEN** its address is written and read back
- **THEN** the heading comes back exactly as it went in, and adds no segment to the route

### Requirement: A position leaves with the page it named

A position describes somewhere inside one document. When the reader follows a link that
names a page without naming a position — a nav entry, another tab, another change — the
address that results SHALL carry no position. The viewer SHALL NOT leave a heading or a
scenario in an address that no longer names the document it belonged to.

#### Scenario: Following a nav link away from a position

- **GIVEN** the address `#/spec/storefront%2Fcheckout?to=purpose`
- **WHEN** the reader opens the board from the nav
- **THEN** the address is `#/board`, naming no position

#### Scenario: A link that carries a position of its own

- **GIVEN** a citation whose address is `#/change/add-guest-checkout/specs?at=store-cart-SC-01`
- **WHEN** the reader follows it
- **THEN** the address keeps that position, and the page opens on the scenario it names

### Requirement: The query carries the reading, and survives

The query string SHALL carry only settings that describe how the store is being read —
which appearance, which board, which filter — and those SHALL survive every navigation
within the viewer, since they are the reading the link was written for rather than a place
in one document.

#### Scenario: An appearance carried across a navigation

- **GIVEN** the address `/?mode=dark#/spec/storefront%2Fcheckout`
- **WHEN** the reader opens a change
- **THEN** `?mode=dark` is still in the address

#### Scenario: A reading and a position in one address

- **GIVEN** the address `/?board=simple#/change/add-guest-checkout?to=why`
- **WHEN** the reader opens the board from the nav
- **THEN** `?board=simple` is still in the address and the position is gone

### Requirement: A copied link is the whole address

The copy button beside a heading or a scenario SHALL put an absolute URL on the clipboard —
origin, path, query and fragment — describing the page the reader is on at the moment they
click and the position they clicked beside. Pasted back, that URL SHALL open the same
document, on the tab holding the thing named, scrolled to it and marking it.

#### Scenario: Copying a heading's link

- **GIVEN** a reader on `#/change/add-guest-checkout/design` with the appearance forced dark
- **WHEN** they copy the link beside the heading `design--the-shape`
- **THEN** the clipboard holds
  `<origin>/?mode=dark#/change/add-guest-checkout/design?to=design--the-shape`

#### Scenario: A link opened on a page whose tab is not in it

- **GIVEN** the address `#/change/add-guest-checkout?at=store-cart-SC-01`, which names no tab
- **WHEN** it is opened
- **THEN** the change opens on the tab holding that scenario rather than on its first
  artifact

### Requirement: A position that names nothing is inert

A position naming something the page does not contain SHALL leave the page as it would have
opened otherwise: the document renders from the top, nothing is marked, and no error is
shown. An address whose fragment carries a position but no route SHALL be read as naming no
route at all.

#### Scenario: A heading the document does not have

- **GIVEN** the address `#/spec/storefront%2Fcheckout?to=a-heading-that-is-not-there`
- **WHEN** it is opened
- **THEN** the capability's page renders from the top, unmarked

#### Scenario: A position with no route in front of it

- **GIVEN** a fragment of `#?to=purpose`
- **WHEN** it is read as a route
- **THEN** it names no route, and the page already on screen is kept

#### Scenario: A position that is present but empty

- **GIVEN** the address `#/spec/storefront%2Fcheckout?to=`
- **WHEN** it is opened
- **THEN** it is read as naming no position, and the page renders from the top

### Requirement: An address written in the old shape still lands

An address carrying `to` or `at` in the query string rather than in the fragment SHALL be
honoured once on load: the page opens on the position named, and the address is rewritten
into the fragment shape without adding an entry to the reader's history. The viewer SHALL
NOT write that shape itself.

#### Scenario: An old link pasted from a task

- **GIVEN** the address `/?to=purpose#/spec/storefront%2Fcheckout`
- **WHEN** it is opened
- **THEN** the page opens scrolled to `purpose`, and the address becomes
  `/#/spec/storefront%2Fcheckout?to=purpose`

#### Scenario: An old link that also carries a reading

- **GIVEN** the address `/?mode=dark&at=store-cart-SC-01#/change/add-guest-checkout`
- **WHEN** it is opened
- **THEN** the address becomes `/?mode=dark#/change/add-guest-checkout?at=store-cart-SC-01`,
  keeping the appearance and moving only the position

#### Scenario: Both shapes in one address

- **GIVEN** an address carrying `?to=` in the query and `?to=` in the fragment
- **WHEN** it is opened
- **THEN** the fragment's position wins, since it is the one the viewer writes, and the
  query's copy is dropped

#### Scenario: Going back after the rewrite

- **GIVEN** an old-shape link opened and rewritten
- **WHEN** the reader presses back
- **THEN** they leave the viewer, having made one navigation rather than two
