import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Switch } from "@astryxdesign/core/Switch";
import { Table } from "@astryxdesign/core/Table";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { useState } from "react";
import { href } from "../api.js";
import { loadSimple, saveSimple, splitIntoColumns } from "../board.js";
import {
  changeTreeByNamespace,
  NO_CAPABILITY,
  TOP_LEVEL,
} from "../capabilities.js";
import { displayName } from "../names.js";
import {
  Command,
  GroupState,
  Idle,
  Owner,
  Progress,
} from "../components/bits.jsx";
import { ChangeRows } from "../components/ChangeRows.jsx";
import StatusStrip from "../components/StatusStrip.jsx";
import {
  applyFilter,
  changeQueues,
  conflictingChanges,
  initialFilter,
  summarize,
} from "../summary.js";
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
 * The simplified board: every change in development on one line, grouped the way the store
 * already groups everything else, with the counts that say what to do about them.
 *
 * Grouped by namespace rather than listed, because a flat run of twenty-one ids is sorted
 * by nothing a reader is thinking in: "how far along is the auction work" is one question
 * and "how far along is loyalty" is another, and the answer to either was four rows apart
 * with three unrelated changes between them. The namespaces come from the capabilities a
 * change deltas, so the grouping is the store's own — the same tree the nav draws, in the
 * same bands the capability index uses.
 *
 * A change that deltas two namespaces is listed under both, for the reason the nav lists
 * it twice: a change rewriting `shared/ui` is ui work however much auction work it also
 * does, and filing it under one would hide it from whoever looked under the other. The
 * heading's count knows the difference — it counts changes, not rows; the row says where
 * else it is filed, so the second sighting reads as the same change rather than a bug.
 *
 * A headline and four counts above the bands, because the reader's first question is not
 * about any one namespace: on a real store this was twenty-one changes of which seven
 * were finished and waiting to be archived, and the page said so nowhere — the reader had
 * to notice seven full bars scattered down three screens. The counts are queues, so a
 * change that is finished *and* in a conflict is in both of them.
 *
 * Two columns, one line per change. Still no task groups and no commands: a group table is
 * what you read when you are about to do something about it, and this reading is for the
 * person who is not. But an owner and a stalled date are one line, and leaving them out
 * meant a board where nothing said who had a change or that nothing had moved on it in a
 * fortnight.
 */
function SimpleBoard({ changes, summary, plainNames }) {
  const [queue, setQueue] = useState(null);
  const queues = changeQueues(summary);
  const conflicting = conflictingChanges(summary.conflicts);

  // Counted against every change, never against the filtered list: a chip that recounts
  // itself once it is pressed is a chip that can only ever read what you already chose.
  const counted = queues.map((q) => ({
    ...q,
    count: changes.filter(q.has).length,
  }));
  const active = counted.find((q) => q.key === queue);
  const shown = active ? changes.filter(active.has) : changes;

  const tree = changeTreeByNamespace(shown);
  // A store that namespaces nothing has one namespace, and a heading naming it would be a
  // band around the whole list saying what the page already says.
  const bare = tree.length === 1 && tree[0].path === TOP_LEVEL;
  const [left, right] = splitIntoColumns(tree);

  const ready = summary.ready.length;

  return (
    <VStack gap={4}>
      <VStack gap={3}>
        <HStack gap={3} align="baseline" wrap="wrap">
          <Heading level={2}>
            {changes.length} {changes.length === 1 ? "change" : "changes"} in
            development
          </Heading>
          {ready > 0 && (
            <Text color="secondary">
              {ready} finished and waiting to be archived
            </Text>
          )}
        </HStack>

        <HStack gap={3} align="center" wrap="wrap">
          <div className="board-chips">
            {/* Buttons rather than Astryx's ToggleButton, which is ghost-only: a row of
                five ghost buttons is a row of text, and a control the reader cannot see
                is a filter nobody will ever press. Pressed state carries on the variant
                and on aria-pressed, since the surface is the only other thing saying it. */}
            {counted.map((q) => (
              <Button
                key={q.key}
                size="sm"
                variant={queue === q.key ? "primary" : "secondary"}
                aria-pressed={queue === q.key}
                label={`${q.label} ${q.count}`}
                icon={<StatusDot variant={q.tone} label="" />}
                isDisabled={q.count === 0}
                onClick={() => setQueue(queue === q.key ? null : q.key)}
              />
            ))}
          </div>
          {active && (
            <Button
              variant="ghost"
              size="sm"
              label="Show everything"
              onClick={() => setQueue(null)}
            />
          )}
        </HStack>
      </VStack>

      {bare ? (
        <ChangeRows
          changes={tree[0].items}
          conflicting={conflicting}
          plainNames={plainNames}
        />
      ) : (
        <div className="board-simple">
          {[left, right].map((column, i) => (
            <div className="board-simple-column" key={i}>
              {column.map((node) => (
                <SimpleGroup
                  key={node.path}
                  node={node}
                  depth={0}
                  plainNames={plainNames}
                  conflicting={conflicting}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </VStack>
  );
}

/**
 * One namespace band, and the namespaces inside it — the capability index's shape.
 *
 * The nested bands collapse and the top-level ones do not: a top-level band is the page's
 * own structure and closing it would leave a heading standing for nothing a reader can
 * see, while "Auction" inside it is a section of a list, which is exactly the thing a
 * disclosure is for once you have found what you came for.
 */
function SimpleGroup({ node, depth, plainNames, conflicting }) {
  const heading = (
    <div className="cap-ns">
      {/* The band's own page: a namespace heads a band here, a band in the catalogue and
          two trees in the nav, and it is the same place every time. Not a link when it is
          the store's stand-in for "filed under nothing", which is not a place to open. */}
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
  );

  const body = (
    <div className="cap-group-body">
      {node.items.length > 0 && (
        <ChangeRows
          changes={node.items}
          conflicting={conflicting}
          plainNames={plainNames}
          band={node.path}
        />
      )}
      {node.children.map((child) => (
        <SimpleGroup
          key={child.path}
          node={child}
          depth={depth + 1}
          plainNames={plainNames}
          conflicting={conflicting}
        />
      ))}
    </div>
  );

  if (depth === 0) {
    return (
      <section className="cap-group">
        {heading}
        {body}
      </section>
    );
  }

  return (
    <section className="cap-group">
      <Collapsible defaultIsOpen trigger={heading}>
        {body}
      </Collapsible>
    </section>
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

function Conflicts({ conflicts }) {
  return conflicts.map((c) => (
    <Banner
      key={c.capability}
      status="warning"
      container="card"
      title={`Two changes in development both delta "${c.capability}"`}
      description={
        <VStack gap={2}>
          <Text size="sm">
            {c.changes.map((u) => u.change).join(" and ")} both write{" "}
            <span className="mono">specs/{c.capability}/</span>. Git will never
            flag it — each change is its own folder — but whichever archives
            second is written against a baseline the first already rewrote, and
            a MODIFIED block whose headers no longer match silently drops the
            rest of the requirement.
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

export default function Board({ board, plainNames }) {
  const [filter, setFilter] = useState(initialFilter);
  const [simple, setSimple] = useState(loadSimple);
  const summary = summarize(board);
  // Ready to archive first, order otherwise untouched. Archiving is the one move on this
  // board that only PM can make, and a finished change reads as just another card if it
  // sits where it happened to fall — so it comes up to meet the panels above it.
  const isReady = (ch) => summary.ready.includes(ch.id);
  const readyFirst = (a, b) => Number(isReady(b)) - Number(isReady(a));

  const chooseSimple = (next) => {
    setSimple(next);
    saveSimple(next);
  };

  // Above everything, and in both readings: it is the one control that is still there
  // after it has hidden the rest of the page.
  const reading = (
    <HStack justify="end">
      <Switch label="Simplified" value={simple} onChange={chooseSimple} />
    </HStack>
  );

  if (simple) {
    // Not narrowed by a tile: the tiles are not on screen, so a `?filter=` in the URL
    // would be a board silently missing changes with nothing on the page saying why.
    // Not re-sorted either — the grouping is the order now, and floating the finished
    // changes to the top of their namespace would sort each band by something the band
    // above it is not sorted by.
    //
    // Conflicts are the exception to dropping the panels. The rest of them are queues —
    // work waiting for somebody, which is exactly what this reading is not for. A
    // conflict is not work waiting: it is two changes already written against the same
    // baseline, where the damage is silent and lands at archive time, and archiving is
    // the move only the person reading the simplified board makes.
    return (
      <VStack gap={4}>
        {reading}
        {summary.conflicts.length > 0 && (
          <div className="board-banners">
            <Conflicts conflicts={summary.conflicts} />
          </div>
        )}
        {board.changes.length > 0 ? (
          <SimpleBoard
            changes={board.changes}
            summary={summary}
            plainNames={plainNames}
          />
        ) : (
          <Card padding={4}>
            <EmptyState
              title="Nothing in development"
              description="Every change in the store has been archived."
              isCompact
            />
          </Card>
        )}
      </VStack>
    );
  }

  const changes = [...applyFilter(board.changes, filter, summary)].sort(
    readyFirst,
  );

  // Every panel that has something to say, in one order for everyone. A tile is a
  // request for one queue, so selecting it narrows the panels to that queue as well as
  // the board below.
  const only = (name) => !filter || filter === name;
  const uncovered = board.changes.filter((ch) =>
    ch.artifacts.some((a) => !a.present),
  );

  const rendered = [
    only("conflicts") && summary.conflicts.length > 0 && (
      <Conflicts key="conflicts" conflicts={summary.conflicts} />
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
      {reading}

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
