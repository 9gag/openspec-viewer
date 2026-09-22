import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { href, useApi } from "../api.js";
import {
  capabilityTreeByNamespace,
  leafOf,
  NO_CAPABILITY,
  summarise,
  TOP_LEVEL,
} from "../capabilities.js";
import { CapabilityFlag, CapabilitySize, Owner } from "../components/bits.jsx";
import { displayName } from "../names.js";
import { ownersOf, statusRows } from "../status.js";
import { changeState } from "../summary.js";

/**
 * Every capability once, and whatever is currently touching it — the board's own progress,
 * read off the change directly rather than a click away.
 *
 * Namespace-grouped the same way the catalogue is: this is the catalogue, with the one
 * thing it otherwise sends a reader to the board to find out already on the row.
 */
export default function Status({ plainNames }) {
  const {
    data: catalog,
    error: catalogError,
    loading: catalogLoading,
  } = useApi("/api/specs", { poll: false });
  const {
    data: board,
    error: boardError,
    loading: boardLoading,
  } = useApi("/api/board", { poll: false });

  if (catalogLoading || boardLoading)
    return <Spinner label="Reading the store" />;

  const error = catalogError ?? boardError;
  if (error) {
    return (
      <Banner
        status="error"
        container="card"
        title="Cannot read the store"
        description={error}
      />
    );
  }

  if (catalog.specs.length === 0) {
    return (
      <EmptyState
        title="No capabilities yet"
        description="A capability appears here as soon as a change deltas it, and becomes shipped behavior when that change is archived."
      />
    );
  }

  const rows = statusRows(catalog.specs, board.changes);
  const tree = capabilityTreeByNamespace(rows);
  // One heading over the whole page would label the page rather than a group inside it: a
  // store that namespaces nothing has one namespace, and it is not worth naming.
  const bare = tree.length === 1 && tree[0].path === TOP_LEVEL;

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1}>Status</Heading>
        <Summary counts={summarise(rows)} />
      </VStack>

      <div className="cap-list">
        {bare ? (
          <Rows caps={tree[0].items} plainNames={plainNames} />
        ) : (
          tree.map((node) => (
            <Namespace
              key={node.path}
              node={node}
              depth={0}
              plainNames={plainNames}
            />
          ))
        )}
      </div>
    </VStack>
  );
}

/** What the store holds, before the list of it — same reading as the Namespace page. */
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

/** One namespace, what is filed directly under it, and the namespaces inside it. */
function Namespace({ node, depth, plainNames }) {
  return (
    <section className="cap-group">
      <div className="cap-ns">
        {node.path === TOP_LEVEL || node.path === NO_CAPABILITY ? (
          <Text
            weight="semibold"
            size={depth === 0 ? undefined : "sm"}
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
        <span className="cap-ns-rule" aria-hidden="true" />
      </div>

      <div className="cap-group-body">
        {node.items.length > 0 && (
          <Rows caps={node.items} plainNames={plainNames} />
        )}
        {node.children.map((child) => (
          <Namespace
            key={child.path}
            node={child}
            depth={depth + 1}
            plainNames={plainNames}
          />
        ))}
      </div>
    </section>
  );
}

/** The capabilities filed directly under one namespace. */
function Rows({ caps, plainNames }) {
  return (
    <div className="cap-rows">
      {caps.map((cap) => (
        <Row key={cap.capability} cap={cap} plainNames={plainNames} />
      ))}
    </div>
  );
}

/** One capability: what it is, its shipped state, and every change currently touching it. */
function Row({ cap, plainNames }) {
  return (
    <div className="cap-row">
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

      <span className="cap-row-flag">
        <CapabilityFlag cap={cap} />
      </span>

      {cap.touching.length > 0 && (
        <VStack gap={1} className="cap-row-touching">
          {cap.touching.map((touching) => (
            <Touching key={touching.changeId} touching={touching} />
          ))}
        </VStack>
      )}
    </div>
  );
}

/**
 * One change touching this capability: its progress if the board still carries it, or a
 * plain notice when it does not — already archived on main, in this checkout's history but
 * off the board for the same reason `StoreWarnings` names at the top of the page.
 */
function Touching({ touching }) {
  if (!touching.change) {
    return (
      <HStack gap={2} align="center" wrap="wrap">
        <Text size="sm" color="secondary" className="mono">
          {touching.changeId}
        </Text>
        <Badge variant="neutral" label="not on this checkout's board" />
      </HStack>
    );
  }

  const { change } = touching;
  const state = changeState(change);

  return (
    <HStack gap={2} align="center" wrap="wrap">
      <Link href={href("change", change.id)} size="sm">
        {touching.changeId}
      </Link>
      <StatusDot variant={state.variant} label={state.label} tooltip={state.label} />
      <Text size="sm" color="secondary" hasTabularNumbers>
        {change.done}/{change.total}
      </Text>
      {ownersOf(change).map((owner) => (
        <Owner key={owner} handle={owner} />
      ))}
    </HStack>
  );
}
