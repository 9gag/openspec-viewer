import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useState } from "react";
import { href } from "../api.js";
import {
  Command,
  GroupState,
  Idle,
  Owner,
  Progress,
} from "../components/bits.jsx";
import StatusStrip from "../components/StatusStrip.jsx";
import { applyFilter, initialFilter, summarize } from "../summary.js";
import { iso } from "../time.js";

const columns = [
  {
    key: "num",
    header: "",
    width: { type: "pixel", value: 40 },
    align: "end",
    renderCell: (g) => (
      <Text size="sm" color="secondary">
        {g.num}
      </Text>
    ),
  },
  {
    key: "title",
    header: "Task group",
    width: { type: "proportional", value: 3 },
    renderCell: (g) => <Text weight="medium">{g.title}</Text>,
  },
  {
    key: "owner",
    header: "Owner",
    width: { type: "proportional", value: 1 },
    renderCell: (g) => <Owner handle={g.owner} />,
  },
  {
    key: "done",
    header: "Done",
    width: { type: "pixel", value: 70 },
    renderCell: (g) => (
      <Text size="sm" color="secondary" hasTabularNumbers>
        {g.done}/{g.total}
      </Text>
    ),
  },
  {
    key: "state",
    header: "State",
    width: { type: "pixel", value: 120 },
    renderCell: (g) => <GroupState done={g.done} total={g.total} />,
  },
  {
    key: "idle",
    header: "Idle since",
    width: { type: "proportional", value: 2 },
    renderCell: (g) => <Idle idle={g.idle} />,
  },
];

function ChangeCard({ change, ready }) {
  if (change.planning) {
    return (
      <Card padding={4}>
        <VStack gap={2}>
          <Link href={href("change", change.id)}>{change.id}</Link>
          <Text color="secondary">No tasks.md yet — still being planned.</Text>
        </VStack>
      </Card>
    );
  }

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <HStack gap={3} align="center" wrap="wrap">
          <Heading level={2}>
            <Link href={href("change", change.id)}>{change.id}</Link>
          </Heading>
          <Text size="sm" color="secondary" hasTabularNumbers>
            {change.done}/{change.total} tasks
          </Text>
          {ready && <Badge variant="success" label="ready to archive" />}
          {change.lastActivity && (
            <HStack gap={1} align="center">
              <Text size="sm" color="secondary">
                last commit
              </Text>
              <Timestamp
                value={iso(change.lastActivity)}
                format="relative"
                size="sm"
                color="secondary"
                hasTooltip
              />
            </HStack>
          )}
        </HStack>
        <Progress
          done={change.done}
          total={change.total}
          label={`${change.id} progress`}
        />
        {/* No wrapper div: Table brings its own scroll container, and nesting one inside
            another clipped the header row and produced two scrollbars. */}
        <Table
          data={change.groups}
          columns={columns}
          idKey="num"
          density="compact"
          hasHover
        />
      </VStack>
    </Card>
  );
}

/**
 * The changes in development that are missing an artifact.
 *
 * A change is a directory of markdown files, and which files belong there is decided by
 * the schema it was created under — so this is read from the change, not from a list
 * kept here. Missing one while a change is still being planned is a normal state; being
 * *built* with one missing is the thing worth spotting early, which is why the count of
 * checked-off tasks is on the line.
 */
function Coverage({ changes }) {
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={2}>Artifact coverage</Heading>
        <VStack gap={3}>
          {changes.map((ch) => {
            const missing = ch.artifacts
              .filter((a) => !a.present)
              .map((a) => a.label)
              .join(", ");
            return (
              <VStack key={ch.id} gap={1}>
                <HStack gap={2} align="center" wrap="wrap">
                  <Link href={href("change", ch.id)}>{ch.id}</Link>
                  {ch.artifacts.map((a) => (
                    <Badge
                      key={a.name}
                      variant={a.present ? "info" : "warning"}
                      label={a.present ? a.label : `${a.label} missing`}
                    />
                  ))}
                </HStack>
                <Text size="sm" color="secondary">
                  {ch.done > 0
                    ? `Being built already (${ch.done}/${ch.total} tasks) with no ${missing}.`
                    : `No ${missing} yet.`}
                </Text>
              </VStack>
            );
          })}
        </VStack>
      </VStack>
    </Card>
  );
}

function Collisions({ collisions }) {
  return collisions.map((c) => (
    <Banner
      key={c.capability}
      status="warning"
      container="card"
      title={`Two changes in development both delta "${c.capability}"`}
      description={
        <VStack gap={2}>
          <Text size="sm">
            {c.changes.map((u) => u.change).join(" and ")} both write{" "}
            <span className="mono">specs/{c.capability}/</span>. This never
            conflicts in git — each change is its own folder — but whichever
            archives second is written against a baseline the first already
            rewrote, and a MODIFIED block whose headers no longer match silently
            drops the rest of the requirement.
          </Text>
          {c.modifies.length > 0 && (
            <Text size="sm" color="secondary">
              Rewriting shipped behavior: {c.modifies.join(", ")}. Sequencing
              them is a planning call — say so in the later proposal.
            </Text>
          )}
        </VStack>
      }
    />
  ));
}

function IdleClaims({ idle, cli }) {
  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={2}>Idle claims</Heading>
        <VStack gap={3}>
          {idle.map(({ change, group, tone }) => (
            <VStack key={`${change}-${group.num}`} gap={1}>
              <HStack gap={2} align="center" wrap="wrap">
                <Owner handle={group.owner} />
                <Text size="sm">
                  has held {group.num}. {group.title} in {change} at{" "}
                  {group.done}/{group.total} since
                </Text>
                <Timestamp
                  value={iso(group.idle.since)}
                  format="relative"
                  size="sm"
                  hasTooltip
                />
              </HStack>
              {tone === "stale" ? (
                <HStack gap={2} align="center" wrap="wrap">
                  <Text size="sm" color="secondary">
                    Pick it back up, or hand it back:
                  </Text>
                  <Command>
                    {cli} unclaim {change} {group.num}
                  </Command>
                </HStack>
              ) : (
                <Text size="sm" color="secondary">
                  Worth asking about.
                </Text>
              )}
            </VStack>
          ))}
        </VStack>
      </VStack>
    </Card>
  );
}

/**
 * Collapsed by default, because it is the longest list and the least urgent: nothing is
 * going wrong, there is simply work to pick up. Expanded, it was six rows of shell
 * commands standing between the reader and the board.
 */
function Unclaimed({ unclaimed, isOpen, cli }) {
  return (
    <Card padding={4}>
      <Collapsible
        defaultIsOpen={isOpen}
        trigger={
          <HStack gap={2} align="center">
            <Heading level={2}>Unclaimed work</Heading>
            <Badge variant="neutral" label={String(unclaimed.length)} />
          </HStack>
        }
      >
        <VStack gap={2} paddingBlock={3}>
          {unclaimed.map(({ change, group }) => (
            <HStack
              key={`${change}-${group.num}`}
              gap={2}
              align="center"
              wrap="wrap"
            >
              <Text size="sm" className="mono">
                {change}
              </Text>
              <Text size="sm">
                → {group.num}. {group.title}
              </Text>
              <Command>
                {cli} claim {change} {group.num}
              </Command>
            </HStack>
          ))}
        </VStack>
      </Collapsible>
    </Card>
  );
}

export default function Board({ board }) {
  const [filter, setFilter] = useState(initialFilter);
  const summary = summarize(board);
  // Ready to archive first, order otherwise untouched. Archiving is the one move on this
  // board that only PM can make, and a finished change reads as just another card if it
  // sits where it happened to fall — so it comes up to meet the panels above it.
  const isReady = (ch) => summary.ready.includes(ch.id);
  const changes = [...applyFilter(board.changes, filter, summary)].sort(
    (a, b) => Number(isReady(b)) - Number(isReady(a)),
  );

  // Every panel that has something to say, in one order for everyone. A tile is a
  // request for one queue, so selecting it narrows the panels to that queue as well as
  // the board below.
  const only = (name) => !filter || filter === name;
  const uncovered = board.changes.filter((ch) =>
    ch.artifacts.some((a) => !a.present),
  );

  const rendered = [
    only("collisions") && summary.collisions.length > 0 && (
      <Collisions key="collisions" collisions={summary.collisions} />
    ),
    only("idle") && summary.idle.length > 0 && (
      <IdleClaims key="idle" idle={summary.idle} cli={board.store.cli} />
    ),
    only("unclaimed") && summary.unclaimed.length > 0 && (
      <Unclaimed
        key="unclaimed"
        unclaimed={summary.unclaimed}
        isOpen={filter === "unclaimed"}
        cli={board.store.cli}
      />
    ),
    // No tile counts this one, so no filter selects it — it appears when some change is
    // missing an artifact its schema asked for, and goes away when none is.
    !filter && uncovered.length > 0 && (
      <Coverage key="coverage" changes={uncovered} />
    ),
  ].filter(Boolean);

  return (
    <VStack gap={4}>
      <StatusStrip summary={summary} active={filter} onFilter={setFilter} />

      {filter && (
        <HStack gap={3} align="center" wrap="wrap">
          <Text size="sm" color="secondary">
            Showing only{" "}
            {filter === "ready" ? "changes ready to archive" : filter}.
          </Text>
          <Button
            variant="ghost"
            size="sm"
            label="Show everything"
            onClick={() => setFilter(null)}
          />
        </HStack>
      )}

      {rendered.length > 0 ? (
        rendered
      ) : (
        <Card padding={4}>
          <EmptyState
            title={filter ? "Nothing matches" : "Nothing to chase"}
            description={
              filter
                ? "No change has work of that kind right now."
                : "Every claimed group has moved recently, every open group has an owner, and no two changes touch the same capability."
            }
            isCompact
          />
        </Card>
      )}

      {changes.map((ch) => (
        <ChangeCard key={ch.id} change={ch} ready={isReady(ch)} />
      ))}
    </VStack>
  );
}
