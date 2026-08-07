import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { ClickableCard } from "@astryxdesign/core/ClickableCard";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { href, useApi } from "../api.js";
import { Artifact } from "../components/bits.jsx";
import WithOutline from "../components/WithOutline.jsx";
import { iso } from "../time.js";

/**
 * The capability index.
 *
 * A list rather than every spec rendered end to end: the previous version stacked four
 * full documents on one page, which made the one you wanted the hardest thing to find and
 * meant the page grew with the store. Names, counts and provenance here; the text lives
 * one click away.
 *
 * Grouped by whether the capability has shipped, because that is the distinction the
 * store itself draws — `openspec/specs/` holds only archived behavior, and a capability
 * with no baseline is not missing, it is simply still in flight.
 */
export function Specs() {
  const { data, error, loading } = useApi("/api/specs", { poll: false });

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

  const shipped = data.specs.filter((s) => s.shipped);
  const inFlight = data.specs.filter((s) => !s.shipped);

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1}>Capabilities</Heading>
        <Text color="secondary">
          Shipped behavior lives in{" "}
          <span className="mono">openspec/specs/</span>, written only by{" "}
          <span className="mono">openspec archive</span>. A capability still in
          flight has no baseline yet — its text is the delta inside the change.
        </Text>
      </VStack>

      <Group
        title="Shipped"
        caps={shipped}
        empty="Nothing has been archived yet."
      />
      <Group
        title="In flight"
        caps={inFlight}
        empty="Every capability in the store has shipped."
      />
    </VStack>
  );
}

function Group({ title, caps, empty }) {
  return (
    <VStack gap={2}>
      <HStack gap={2} align="center">
        <Heading level={2}>{title}</Heading>
        <Badge variant="neutral" label={String(caps.length)} />
      </HStack>
      {caps.length === 0 ? (
        <Text size="sm" color="secondary">
          {empty}
        </Text>
      ) : (
        caps.map((c) => <Row key={c.capability} cap={c} />)
      )}
    </VStack>
  );
}

/** One capability: what it is, how big it is, and what is happening to it. */
function Row({ cap }) {
  return (
    <ClickableCard
      label={`Open ${cap.capability}`}
      href={href("spec", cap.capability)}
      padding={4}
    >
      <VStack gap={2}>
        <HStack gap={3} align="center" wrap="wrap">
          <Heading level={3}>{cap.capability}</Heading>
          {cap.shipped ? (
            <Text size="sm" color="secondary">
              {cap.requirements} requirement{cap.requirements === 1 ? "" : "s"}{" "}
              · {cap.scenarios} scenario
              {cap.scenarios === 1 ? "" : "s"}
            </Text>
          ) : (
            <Text size="sm" color="secondary">
              no baseline yet
            </Text>
          )}
          {cap.commit && (
            <HStack gap={1} align="center">
              <Text size="sm" color="secondary">
                updated
              </Text>
              <Timestamp
                value={iso(cap.commit.at)}
                format="relative"
                size="sm"
                color="secondary"
                hasTooltip
              />
            </HStack>
          )}
        </HStack>
        <ChangedBy history={cap.history} capability={cap.capability} compact />
      </VStack>
    </ClickableCard>
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
 * The link nothing else in the toolchain provides. In front of a spec the question is
 * always "what put this here, and what is about to change it" — the tree holds both
 * directions and only the index was missing.
 */
function ChangedBy({ history, capability, compact = false }) {
  if (history.length === 0) {
    return (
      <Text size="sm" color="secondary">
        No change in the store touches {capability}.
      </Text>
    );
  }

  return (
    <VStack gap={1}>
      {!compact && (
        <Text size="sm" weight="medium">
          Changed by
        </Text>
      )}
      {history.map((h) => (
        <HStack key={h.change} gap={2} align="center" wrap="wrap">
          {compact ? (
            <Text size="sm" className="mono">
              {h.changeId}
            </Text>
          ) : (
            <Link href={href("change", h.change)}>{h.changeId}</Link>
          )}
          {h.kinds.map((k) => (
            <Badge
              key={k}
              variant={k === "MODIFIED" ? "warning" : "info"}
              label={k}
            />
          ))}
          {h.archived ? (
            <Text size="sm" color="secondary">
              archived {h.archivedOn}
            </Text>
          ) : (
            <Badge variant="neutral" label="in flight" />
          )}
        </HStack>
      ))}
    </VStack>
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

      {data.archive.map((a) => (
        <Card key={a.id} padding={4}>
          <VStack gap={2}>
            <HStack gap={3} align="center" wrap="wrap">
              <Heading level={2}>
                <Link href={href("change", a.id)}>{a.changeId}</Link>
              </Heading>
              {a.archivedOn && <Badge variant="neutral" label={a.archivedOn} />}
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
            </HStack>
            <HStack gap={2} wrap="wrap">
              <Text size="sm" color="secondary">
                produced:
              </Text>
              {a.capabilities.map((c) => (
                <Badge key={c} variant="info" label={c} />
              ))}
            </HStack>
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}
