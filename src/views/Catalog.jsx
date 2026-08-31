import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useCallback, useEffect, useRef, useState } from "react";
import { href, useApi } from "../api.js";
import {
  groupByNamespace,
  leafOf,
  summarise,
  TOP_LEVEL,
} from "../capabilities.js";
import { Artifact } from "../components/bits.jsx";
import {
  Timeline,
  TimelineEntry,
  TimelineHead,
} from "../components/Timeline.jsx";
import WithOutline from "../components/WithOutline.jsx";
import { iso } from "../time.js";

/**
 * What a row says instead of a requirement count.
 *
 * "no baseline" rather than "unshipped" because the row is stating a fact about the store
 * — there is nothing in `openspec/specs/` to read — where "unshipped" is the state that
 * fact puts the capability in. Retired says the state, because there is no fact plainer
 * than it: the store withdrew the behavior.
 */
const STATE_WORD = {
  unshipped: "no baseline",
  retired: "retired",
};

/**
 * The capability index.
 *
 * Names, counts and provenance; the text lives one click away. An earlier version stacked
 * four full documents on one page, which made the one you wanted the hardest thing to find
 * and meant the page grew with the store.
 *
 * Grouped by namespace, because the store already wrote one into every capability path and
 * the catalog was flattening it away — nine groups of one to eleven were being shown as a
 * run of fifty-one. What is happening to a capability rides on the row as a chip rather
 * than splitting the page in two: shipped and unshipped are states of a capability a reader
 * is looking for by name, and separating them separates the list they are scanning.
 *
 * The changed-by timeline is deliberately not here. It is the same list on every row, two
 * to seven lines apiece, and `spec/<id>` shows more of it than this page ever did.
 */
export function Specs() {
  const { data, error, loading } = useApi("/api/specs", { poll: false });

  // The capability whose changes are open, held by name rather than by object: the payload
  // is refetched on focus, and a captured entry would go stale the moment it is.
  const [opened, setOpened] = useState(null);
  const close = useCallback(() => setOpened(null), []);

  useEffect(() => {
    if (!opened) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpened(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [opened]);

  if (loading) return <Spinner label="Reading the capability index" />;
  if (error)
    return (
      <Banner
        status="error"
        container="card"
        title="Cannot read specs"
        description={error}
      />
    );

  if (data.specs.length === 0) {
    return (
      <EmptyState
        title="No capabilities yet"
        description="A capability appears here as soon as a change deltas it, and becomes shipped behavior when that change is archived."
      />
    );
  }

  const groups = groupByNamespace(data.specs);
  // A capability can leave the store between polls; the panel closes rather than holding a
  // name nothing answers to.
  const showing = data.specs.find((c) => c.capability === opened) ?? null;

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1}>Capabilities</Heading>
        <Summary counts={summarise(data.specs)} />
      </VStack>

      {/* Wraps the grid and the scrim together: the scrim covers the page, so it cannot
          sit inside the grid that the panel is a column of. */}
      <div className="cap-shell">
        <div className="cap-page" data-panel={showing ? "open" : undefined}>
          <div className="cap-list">
            {groups.map((group) => (
              <Namespace
                key={group.name}
                group={group}
                opened={opened}
                onOpen={setOpened}
              />
            ))}
          </div>

          {showing && <ChangesPanel cap={showing} onClose={close} />}
        </div>

        {/* Only ever visible in the overlay case; the docked panel takes nothing away. */}
        {showing && (
          <div className="cap-scrim" onClick={close} aria-hidden="true" />
        )}
      </div>
    </VStack>
  );
}

/**
 * What the store holds, before the list of it.
 *
 * Contested rides on a Badge rather than coloured text, the same way the board reports an
 * idle claim: Astryx's TextColor has no warning member, and a themed badge survives a theme
 * swap.
 */
function Summary({ counts }) {
  const said = [
    [counts.total, "capabilities"],
    [counts.shipped, "shipped"],
    [counts.unshipped, "no baseline yet"],
    [counts.retired, "retired"],
  ].filter(([n]) => n > 0);

  return (
    <HStack gap={2} align="center" wrap="wrap">
      <Text color="secondary" hasTabularNumbers>
        {said.map(([n, word]) => `${n} ${word}`).join(" · ")}
      </Text>
      {counts.contested > 0 && (
        <Badge variant="warning" label={`${counts.contested} contested`} />
      )}
    </HStack>
  );
}

/**
 * One namespace and its capabilities.
 *
 * The heading comes off entirely when nothing in the store is namespaced — a single
 * "top level" over the whole page would label the page, not a group within it.
 */
function Namespace({ group, opened, onOpen }) {
  return (
    <section>
      {group.titled && (
        <div className="cap-ns">
          <Text
            weight="semibold"
            className={group.name === TOP_LEVEL ? undefined : "mono"}
          >
            {group.name}
          </Text>
          <Badge variant="neutral" label={String(group.caps.length)} />
          {/* Runs the heading out to the edge, so the group reads as a band rather than a
              line of text floating above a list. */}
          <span className="cap-ns-rule" aria-hidden="true" />
        </div>
      )}
      <div>
        {group.caps.map((cap) => (
          <Row
            key={cap.capability}
            cap={cap}
            isOpen={cap.capability === opened}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

/**
 * One capability: what it is, how big it is, and whether anything is rewriting it.
 *
 * The row is a div rather than a link now that it carries buttons — an anchor wrapping
 * buttons is invalid and unusable with a keyboard — so the name is its own link and the two
 * actions are their own buttons. Nothing marks a quiet shipped row, so the only colour on
 * the page is on the rows that need an answer.
 */
function Row({ cap, isOpen, onOpen }) {
  return (
    <div className="cap-row" data-open={isOpen ? "" : undefined}>
      {/* Still a link, but carrying the type it had as plain text: fifty-one names in link
          blue would be the loudest thing on a page whose point is that only the rows
          needing an answer are coloured. */}
      <Link
        href={href("spec", cap.capability)}
        className="cap-row-name"
        size="sm"
        weight="medium"
        color="primary"
      >
        {leafOf(cap.capability)}
      </Link>

      <Text size="sm" color="secondary" hasTabularNumbers>
        {cap.state === "shipped"
          ? `${cap.requirements} req · ${cap.scenarios} sc`
          : STATE_WORD[cap.state]}
      </Text>

      <span className="cap-row-tail">
        <span className="cap-row-flag">
          {cap.inFlight > 0 && (
            <Badge
              variant={cap.inFlight > 1 ? "warning" : "info"}
              label={
                cap.inFlight > 1 ? `${cap.inFlight} in flight` : "in flight"
              }
            />
          )}
        </span>
        {/* No commit means a store nobody has committed; the cell stays empty rather than
            carrying an age invented from nothing. */}
        <span className="cap-row-age">
          {cap.commit && (
            <Timestamp
              value={iso(cap.commit.at)}
              format="relative"
              size="sm"
              color="secondary"
              hasTooltip
            />
          )}
        </span>
      </span>

      <span className="cap-row-actions">
        {/* A capability with no baseline still opens: that page says why there is nothing
            to read and points at the change bringing it in. */}
        <Button
          size="sm"
          variant="ghost"
          label={`View latest ${cap.capability}`}
          href={href("spec", cap.capability)}
        >
          View latest
        </Button>
        <Button
          size="sm"
          variant={isOpen ? "secondary" : "ghost"}
          label={`View changes to ${cap.capability}`}
          onClick={() => onOpen(isOpen ? null : cap.capability)}
        >
          View changes
        </Button>
      </span>
    </div>
  );
}

/**
 * The changes to one capability, beside the list rather than under every row.
 *
 * This is the timeline the index used to repeat under all fifty-one rows, which is what
 * made the page nine screens long. Asked for, it costs nothing: `history` is already on the
 * payload the index is drawn from, so opening it is not a fetch.
 *
 * It docks to the right when the list has room for it and slides over the page when it does
 * not — decided by container width in app.css rather than here, since it is a question about
 * the space available and not about the data.
 */
function ChangesPanel({ cap, onClose }) {
  const ref = useRef(null);

  // Move focus in on open so Escape and Tab land somewhere sensible, and so the overlay
  // case does not leave a keyboard behind on the row underneath it.
  //
  // preventScroll, because the panel's own place in the document is the top of the list:
  // focusing it normally scrolls there, which threw the reader back to the top of the page
  // every time they opened a row further down. The panel is already in view — it is stuck
  // to the top of the scrollport — so there is nothing to scroll to.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [cap.capability]);

  return (
    <aside
      className="cap-panel"
      ref={ref}
      tabIndex={-1}
      aria-label={`Changes to ${cap.capability}`}
    >
      <div className="cap-panel-head">
        <VStack gap={0}>
          <Text size="sm" color="secondary">
            Changed by
          </Text>
          <Text weight="semibold" className="mono">
            {cap.capability}
          </Text>
        </VStack>
        <IconButton
          label="Close"
          icon={<span aria-hidden="true">×</span>}
          variant="ghost"
          size="sm"
          onClick={onClose}
        />
      </div>

      <div className="cap-panel-body">
        {cap.history.length === 0 ? (
          <Text size="sm" color="secondary">
            No change in the store touches this capability.
          </Text>
        ) : (
          <Timeline roomy>
            {cap.history.map((h) => (
              <Entry key={h.change} entry={h} />
            ))}
          </Timeline>
        )}
      </div>
    </aside>
  );
}

/**
 * One capability in full.
 *
 * Its own route so a spec can be linked to, read at length, and navigated with the
 * outline rail — none of which works when four of them share a page.
 */
export function SpecDetail({ id }) {
  const { data, error, loading } = useApi(
    `/api/spec?id=${encodeURIComponent(id)}`,
    { poll: false },
  );

  if (loading) return <Spinner label={`Reading ${id}`} />;
  if (error) {
    return (
      <Banner
        status="error"
        container="card"
        title={`Cannot read ${id}`}
        description={error}
      />
    );
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Link href={href("specs")}>← All capabilities</Link>
        <HStack gap={3} align="center" wrap="wrap">
          <Heading level={1}>{data.capability}</Heading>
          <Badge
            variant={data.shipped ? "success" : "info"}
            label={data.shipped ? "shipped" : "in flight"}
          />
          {data.shipped && (
            <Text size="sm" color="secondary">
              {data.requirements} requirement
              {data.requirements === 1 ? "" : "s"} · {data.scenarios} scenario
              {data.scenarios === 1 ? "" : "s"}
            </Text>
          )}
        </HStack>
      </VStack>

      <Card padding={4}>
        <ChangedBy history={data.history} capability={data.capability} />
      </Card>

      <WithOutline>
        {data.shipped ? (
          <Card padding={4}>
            <Artifact
              text={data.text}
              path={data.path}
              commit={data.commit}
              bdd
              prefix={data.capability}
            />
          </Card>
        ) : (
          <Card padding={4}>
            <EmptyState
              title="Not shipped yet"
              description={`No baseline in openspec/specs/${data.capability}/. Read the delta inside the change that introduces it.`}
              isCompact
            />
          </Card>
        )}
      </WithOutline>
    </VStack>
  );
}

/**
 * Which changes touched this capability, newest first.
 *
 * Only `spec/<id>` shows this. It used to sit on the index too, under every row, which
 * made the same list the page repeated fifty-one times and put the capability a reader
 * came for further down with each one.
 *
 * The link nothing else in the toolchain provides. In front of a spec the question is
 * always "what put this here, and what is about to change it" — the tree holds both
 * directions and only the index was missing.
 *
 * Drawn as a timeline because that is what the list is: dates down one column, a dot per
 * change on a running line, the change itself on the other side. Squaring the dates off
 * lets the sequence be read at a glance, which a flat row of ragged ids never allowed.
 */
function ChangedBy({ history, capability }) {
  if (history.length === 0) {
    return (
      <Text size="sm" color="secondary">
        No change in the store touches {capability}.
      </Text>
    );
  }

  return (
    <VStack gap={2}>
      <Text size="sm" weight="medium">
        Changed by
      </Text>
      <Timeline>
        {history.map((h) => (
          <Entry key={h.change} entry={h} />
        ))}
      </Timeline>
    </VStack>
  );
}

/**
 * One change on the timeline.
 *
 * The when column carries the archive date, or "in flight" for a change that has not
 * landed — the same column, because both answer "where in the sequence is this". That
 * leaves the state to the dot alone, which is enough once the word is already in the
 * column beside it.
 */
function Entry({ entry }) {
  const state = entry.archived ? "archived" : "in flight";
  return (
    <TimelineEntry
      when={entry.archivedOn ?? state}
      state={state}
      variant={entry.archived ? "neutral" : "accent"}
    >
      <TimelineHead>
        <Link href={href("change", entry.change)}>{entry.changeId}</Link>
        {entry.kinds.map((k) => (
          <Badge
            key={k}
            variant={k === "MODIFIED" ? "warning" : "info"}
            label={k}
          />
        ))}
      </TimelineHead>
    </TimelineEntry>
  );
}

/** Everything that has shipped, newest first. */
export function Archive() {
  const { data, error, loading } = useApi("/api/archive", { poll: false });

  if (loading) return <Spinner label="Reading the archive" />;
  if (error)
    return (
      <Banner
        status="error"
        container="card"
        title="Cannot read the archive"
        description={error}
      />
    );

  if (data.archive.length === 0) {
    return (
      <EmptyState
        title="Nothing archived yet"
        description="A change is archived once it is deployed — not when the code merges."
      />
    );
  }

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1}>Shipped changes</Heading>
        <Text color="secondary">
          Archived after deployment, not at merge. Archiving folded each
          one&apos;s deltas into the baseline specs.
        </Text>
      </VStack>

      {/* One timeline rather than a card apiece: the archive is a sequence, and the
          dates it is ordered by belong in a column of their own. */}
      <Card padding={4}>
        <Timeline roomy>
          {data.archive.map((a) => (
            <TimelineEntry
              key={a.id}
              when={a.archivedOn ?? "archived"}
              state="archived"
            >
              <VStack gap={1}>
                <TimelineHead>
                  <Link href={href("change", a.id)}>{a.changeId}</Link>
                  <Text size="sm" color="secondary" hasTabularNumbers>
                    {a.tasks} tasks
                  </Text>
                  {a.commit && (
                    <HStack gap={1} align="center">
                      <Text size="sm" color="secondary">
                        archived
                      </Text>
                      <Timestamp
                        value={iso(a.commit.at)}
                        format="relative"
                        size="sm"
                        color="secondary"
                        hasTooltip
                      />
                    </HStack>
                  )}
                </TimelineHead>
                {/* A change can archive without touching a spec — say so, rather than
                    trailing a "produced:" that nothing follows. */}
                {a.capabilities.length === 0 ? (
                  <Text size="sm" color="secondary">
                    no capability deltas
                  </Text>
                ) : (
                  <HStack gap={2} align="center" wrap="wrap">
                    <Text size="sm" color="secondary">
                      produced:
                    </Text>
                    {a.capabilities.map((c) => (
                      <Badge key={c} variant="info" label={c} />
                    ))}
                  </HStack>
                )}
              </VStack>
            </TimelineEntry>
          ))}
        </Timeline>
      </Card>
    </VStack>
  );
}
