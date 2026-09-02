import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { SelectableCard } from "@astryxdesign/core/SelectableCard";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";

/**
 * Five facts across the top, four of which are queues you can click into.
 *
 * Each tile is zero when there is nothing to do. That is the whole design rule: a number
 * that only gets more reassuring as the store goes quiet — total specs, percent complete —
 * is at its most comforting exactly when the tool has nothing useful to say.
 *
 * Selecting a tile narrows the board below to what it counts, so the number and the work
 * are never two separate things to reconcile.
 */
function Tile({ count, label, hint, tone, filter, active, onFilter }) {
  const selected = active === filter;

  return (
    <SelectableCard
      label={`${count} ${label}`}
      isSelected={selected}
      onChange={(next) => onFilter(next ? filter : null)}
      padding={4}
      variant={selected ? "muted" : undefined}
      isDisabled={count === 0}
    >
      <VStack gap={1}>
        <HStack gap={2} align="center">
          {count > 0 && tone && <StatusDot variant={tone} label="" />}
          <Heading
            level={2}
            type="display-3"
            color={count === 0 ? "secondary" : "primary"}
          >
            {count}
          </Heading>
        </HStack>
        <Text size="sm" weight="medium">
          {label}
        </Text>
        <Text size="sm" color="secondary">
          {count === 0 ? hint.clear : hint.some}
        </Text>
      </VStack>
    </SelectableCard>
  );
}

/** Not a queue — you cannot work through it, so it does not filter anything. */
function StoreTile({ state }) {
  return (
    <Card padding={4} variant={state.tone === "ok" ? undefined : "muted"}>
      <VStack gap={1}>
        <HStack gap={2} align="center">
          <StatusDot
            variant={state.tone === "ok" ? "success" : state.tone}
            label=""
          />
          <Text weight="semibold">{state.label}</Text>
        </HStack>
        <Text size="sm" weight="medium">
          store
        </Text>
        <Text size="sm" color="secondary">
          {state.detail}
        </Text>
      </VStack>
    </Card>
  );
}

export default function StatusStrip({ summary, active, onFilter }) {
  return (
    <div className="status-strip">
      <Tile
        count={summary.conflicts.length}
        label="conflicts"
        tone="error"
        filter="conflicts"
        active={active}
        onFilter={onFilter}
        hint={{
          clear: "no two changes share a capability",
          some: "will break at archive time, not in git",
        }}
      />
      <Tile
        count={summary.idle.length}
        label="idle claims"
        tone={
          summary.idle.some((i) => i.tone === "stale") ? "error" : "warning"
        }
        filter="idle"
        active={active}
        onFilter={onFilter}
        hint={{
          clear: "every claim has moved recently",
          some: "a name on work nobody is doing",
        }}
      />
      <Tile
        count={summary.ready.length}
        label="ready to archive"
        tone="success"
        filter="ready"
        active={active}
        onFilter={onFilter}
        hint={{
          clear: "nothing is fully checked off",
          some: "archive once it's deployed — PM's call",
        }}
      />
      <Tile
        count={summary.unclaimed.length}
        label="unclaimed"
        tone="warning"
        filter="unclaimed"
        active={active}
        onFilter={onFilter}
        hint={{
          clear: "every open group has an owner",
          some: "open work anyone can take",
        }}
      />
      <StoreTile state={summary.store} />
    </div>
  );
}
