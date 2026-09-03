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
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { href, useApi } from "../api.js";
import { displayName } from "../names.js";
import { loadLens, saveLens } from "../spec.js";
import {
  capabilityTreeByNamespace,
  leafOf,
  NO_CAPABILITY,
  summarise,
  TOP_LEVEL,
} from "../capabilities.js";
import {
  Artifact,
  CapabilityFlag,
  CapabilitySize,
  LensControl,
} from "../components/bits.jsx";
import {
  Timeline,
  TimelineEntry,
  TimelineHead,
} from "../components/Timeline.jsx";
import References from "../components/References.jsx";
import WithOutline from "../components/WithOutline.jsx";
import { iso } from "../time.js";

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
export function Specs({ plainNames }) {
  const { data, error, loading } = useApi("/api/specs", { poll: false });

  // Which row's changes are open: the capability by name, and the button it was opened
  // from, which is what the panel is placed against. Held by name rather than by object
  // because the payload is refetched on focus and a captured entry goes stale the moment it
  // is; held here rather than per row so opening one closes the last.
  const [opened, setOpened] = useState(null);

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

  const tree = capabilityTreeByNamespace(data.specs);
  // One heading over the whole page would label the page rather than a group inside it:
  // a store that namespaces nothing has one namespace, and it is not worth naming.
  const bare = tree.length === 1 && tree[0].path === TOP_LEVEL;
  // A capability can leave the store between reads; the panel closes rather than holding a
  // name nothing answers to.
  const showing = opened
    ? (data.specs.find((c) => c.capability === opened.capability) ?? null)
    : null;

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1}>Namespace</Heading>
        <Summary counts={summarise(data.specs)} />
      </VStack>

      <div className="cap-list">
        {bare ? (
          <Rows
            caps={tree[0].items}
            plainNames={plainNames}
            opened={opened?.capability ?? null}
            onOpen={setOpened}
          />
        ) : (
          tree.map((node) => (
            <Namespace
              key={node.path}
              node={node}
              depth={0}
              plainNames={plainNames}
              opened={opened?.capability ?? null}
              onOpen={setOpened}
            />
          ))
        )}
      </div>

      {showing && (
        <ChangesPanel
          cap={showing}
          anchor={opened.anchor}
          onClose={() => setOpened(null)}
        />
      )}
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
 * One namespace, what is filed directly under it, and the namespaces inside it.
 *
 * Recursive, because the store's namespaces are: `storefront/checkout` is two levels, and
 * a page that lists it as one string makes the reader do the grouping — everything under a
 * product sorts together only because the paths happen to share a prefix, and nothing on
 * the page says so. Nested, the product is a heading and its domains are inside it.
 *
 * The count is everything beneath the namespace rather than the rows directly under it,
 * which is what makes a product's heading worth reading on its own.
 */
function Namespace({ node, depth, plainNames, opened, onOpen }) {
  return (
    <section className="cap-group">
      <div className="cap-ns">
        {/* The band's own page, the same one the board's bands and the change titles go
            to. Not a link for the store's stand-in for "filed under nothing", which is a
            bucket rather than a place. */}
        {node.path === TOP_LEVEL || node.path === NO_CAPABILITY ? (
          <Text
            weight="semibold"
            size={depth === 0 ? undefined : "sm"}
            // Ids are paths and read as paths everywhere else in the app; the sentence
            // the name toggle puts here is prose, and monospacing prose only makes it
            // narrow.
            className={plainNames ? undefined : "mono"}
          >
            {displayName(node.name, plainNames)}
          </Text>
        ) : (
          <Link
            href={href("namespace", node.path)}
            weight="semibold"
            size={depth === 0 ? undefined : "sm"}
            color="primary"
            className={plainNames ? undefined : "mono"}
          >
            {displayName(node.name, plainNames)}
          </Link>
        )}
        <Badge variant="neutral" label={String(node.count)} />
        {/* Runs the heading out to the edge, so the group reads as a band rather than a
            line of text floating above a list. */}
        <span className="cap-ns-rule" aria-hidden="true" />
      </div>

      <div className="cap-group-body">
        {node.items.length > 0 && (
          <Rows
            caps={node.items}
            plainNames={plainNames}
            opened={opened}
            onOpen={onOpen}
          />
        )}
        {node.children.map((child) => (
          <Namespace
            key={child.path}
            node={child}
            depth={depth + 1}
            plainNames={plainNames}
            opened={opened}
            onOpen={onOpen}
          />
        ))}
      </div>
    </section>
  );
}

/** The capabilities filed directly under one namespace. */
function Rows({ caps, plainNames, opened, onOpen }) {
  return (
    <div className="cap-rows">
      {caps.map((cap) => (
        <Row
          key={cap.capability}
          cap={cap}
          plainNames={plainNames}
          isOpen={cap.capability === opened}
          onOpen={onOpen}
        />
      ))}
    </div>
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
function Row({ cap, plainNames, isOpen, onOpen }) {
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
        {displayName(leafOf(cap.capability), plainNames)}
      </Link>

      <CapabilitySize cap={cap} />

      <span className="cap-row-tail">
        <span className="cap-row-flag">
          <CapabilityFlag cap={cap} />
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
        {/* One button, not two. The other said "View latest" and went where the row's own
            name already goes — on a page of fifty rows that is fifty controls that do
            nothing new, in the column the eye follows down the page. */}
        {/* The button is the panel's anchor: it opens beside the row that asked, and the
            panel keeps itself on screen from there. */}
        <Button
          size="sm"
          variant={isOpen ? "secondary" : "ghost"}
          label={`View changes to ${cap.capability}`}
          aria-expanded={isOpen}
          aria-haspopup="dialog"
          onClick={(e) =>
            onOpen(
              isOpen
                ? null
                : { capability: cap.capability, anchor: e.currentTarget },
            )
          }
        >
          Changes
        </Button>
      </span>
    </div>
  );
}

/** How far the panel sits off its button, and off the edge of the window. */
const GAP = 10;
const EDGE = 16;

/**
 * Where the panel goes: beside its button, and never off the screen.
 *
 * Two rules, and the second is the whole reason this is not CSS anchor positioning. Anchor
 * positioning tracks the button exactly, which is right when the panel opens and wrong a
 * moment later — scroll on and the panel rides off the top of the window with the row that
 * opened it, while the reader is still reading it. So the top follows the button until the
 * button reaches the edge, and then stops. Sticky, in the sense the word has everywhere
 * else.
 *
 * Capture on the scroll listener because the page scrolls inside the app shell rather than
 * on the window, and a scroll event on an inner element does not bubble.
 */
function useAnchoredTo(anchor, panelRef) {
  const [at, setAt] = useState(null);

  useLayoutEffect(() => {
    if (!anchor) return undefined;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      const width = panel?.width ?? 340;
      const height = panel?.height ?? 260;

      // Beside the button, or on its other side when the window has no room to the right.
      let left = a.right + GAP;
      if (left + width > window.innerWidth - EDGE) left = a.left - width - GAP;
      left = Math.max(EDGE, left);

      const lowest = Math.max(EDGE, window.innerHeight - height - EDGE);
      setAt({ left, top: Math.min(Math.max(a.top, EDGE), lowest) });
    };

    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, panelRef]);

  return at;
}

/**
 * The changes to one capability, beside the row that asked for them.
 *
 * This is the timeline the index used to repeat under all fifty-one rows, which is what
 * made the page nine screens long. Asked for, it costs nothing: `history` is already on the
 * payload the index is drawn from, so opening it is not a fetch.
 *
 * Hand-placed rather than an Astryx Popover, which cannot both stay beside its button and
 * stay on screen — see useAnchoredTo. Everything inside it is still Astryx.
 */
function ChangesPanel({ cap, anchor, onClose }) {
  const ref = useRef(null);
  const at = useAnchoredTo(anchor, ref);

  // preventScroll: the panel is placed against a button already in view, so there is
  // nothing to scroll to — and scrolling to it is what threw the page back to the top.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, [cap.capability]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      onClose();
      // Escape should leave the keyboard where it started, not at the top of the document.
      anchor?.focus?.();
    };

    // pointerdown rather than click: a click that starts inside the panel and ends outside
    // it — a drag on the scrollbar, a selection — is not a click away from it.
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || anchor?.contains(e.target)) return;
      onClose();
    };

    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [anchor, onClose]);

  return (
    <div
      className="cap-changes"
      ref={ref}
      role="dialog"
      tabIndex={-1}
      aria-label={`Changes to ${cap.capability}`}
      // Placed before it is measured would put it at 0,0 for a frame; hidden until then.
      style={at ? { top: at.top, left: at.left } : { visibility: "hidden" }}
    >
      <div className="cap-changes-head">
        <VStack gap={0}>
          <Text size="sm" color="secondary">
            Changed by
          </Text>
          <Text size="sm" weight="semibold" className="mono">
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

      <div className="cap-changes-body">
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
    </div>
  );
}

/** The tab holding the spec itself. Not a filename, since spec.md is never a sibling. */
const SPEC_TAB = "spec";

/** What the open tab shows: the spec itself, or one of the documents kept beside it. */
function SpecBody({ cap, doc, lens, onLens }) {
  if (doc) {
    return (
      <Artifact
        text={doc.text}
        path={doc.path}
        commit={doc.commit}
        prefix={doc.name}
      />
    );
  }

  if (!cap.shipped) {
    return (
      <EmptyState
        title="Not shipped yet"
        description={`No baseline in openspec/specs/${cap.capability}/. Read the delta inside the change that introduces it.`}
        isCompact
      />
    );
  }

  return (
    <VStack gap={3}>
      <HStack hAlign="end">
        <LensControl value={lens} onChange={onLens} />
      </HStack>
      <Artifact
        text={cap.text}
        path={cap.path}
        commit={cap.commit}
        bdd
        prefix={cap.capability}
        lens={lens}
      />
    </VStack>
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

  // Which reading of the spec is on screen, remembered per browser: a reader working
  // through scenarios is doing that all afternoon, not for one page.
  const [lens, setLens] = useState(loadLens);
  const chooseLens = (next) => {
    setLens(next);
    saveLens(next);
  };

  // Which document is open. Back to the spec whenever the capability changes: what a
  // directory holds beside its spec is that capability's own business, and the next one
  // may keep nothing at all.
  const [tab, setTab] = useState(SPEC_TAB);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` is the whole dependency — the tab it resets is deliberately not one
  useEffect(() => setTab(SPEC_TAB), [id]);

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

  // Whatever the capability directory holds besides spec.md — test cases, notes, anything
  // the store files with the requirements it belongs to. An unshipped capability has no
  // directory, so it has none of these.
  const docs = data.docs ?? [];
  const active = docs.some((d) => d.name === tab) ? tab : SPEC_TAB;
  const doc = docs.find((d) => d.name === active);

  return (
    <VStack gap={4} className="doc-page">
      <VStack gap={2}>
        <Link href={href("specs")}>← Namespace</Link>
        <HStack gap={3} align="center" wrap="wrap">
          <Heading level={1}>{data.capability}</Heading>
          <Badge
            variant={data.shipped ? "success" : "info"}
            label={data.shipped ? "shipped" : "in development"}
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

      {/* The shipped spec and everything filed with it, checked against the ids the store
          defines. A journey beside a baseline is the finished article — nothing is going
          to come along later and define the scenario it names. */}
      <References references={data.references} />

      {/* Only when there is something to switch to: a lone tab reading "Requirements"
          over the requirements is a control that decides nothing. */}
      {docs.length > 0 && (
        <TabList value={active} onChange={setTab} hasDivider>
          <Tab value={SPEC_TAB} label="Requirements" />
          {docs.map((d) => (
            <Tab key={d.name} value={d.name} label={d.label} />
          ))}
        </TabList>
      )}

      <WithOutline>
        <Card padding={4}>
          <SpecBody cap={data} doc={doc} lens={lens} onLens={chooseLens} />
        </Card>
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
 * The when column carries the archive date, or "in development" for a change that has not
 * landed — the same column, because both answer "where in the sequence is this". That
 * leaves the state to the dot alone, which is enough once the word is already in the
 * column beside it.
 */
function Entry({ entry }) {
  const state = entry.archived ? "archived" : "in development";
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
                  {/* The day it shipped, said again as an age — the column beside it
                      gives the date, and "three weeks ago" is the half of that a reader
                      does the arithmetic for otherwise. Not the commit: a store imported
                      in one go carries one commit date across a year of releases. */}
                  {a.at > 0 && (
                    <HStack gap={1} align="center">
                      <Text size="sm" color="secondary">
                        archived
                      </Text>
                      <Timestamp
                        value={iso(a.at)}
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
