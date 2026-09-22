import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { useState } from "react";

import { changesTouching, resolveUpcoming } from "../upcoming.js";
import SpecText from "./SpecText.jsx";

/**
 * `spec/<id>`'s Upcoming reading: every in-development change on the capability, folded
 * onto the baseline at once (see `server/upcoming.mjs` and `src/upcoming.js`).
 *
 * Owns which changes are enabled itself, keyed by the caller on the capability id — a
 * fresh capability is a fresh chip row, all on, and a `key` remount says that for free
 * instead of an effect watching for the id to change.
 */
export default function Upcoming({ cap }) {
  const requirements = cap.upcoming?.requirements ?? [];
  const changes = changesTouching(requirements);
  const [enabled, setEnabled] = useState(() => new Set(changes));

  const toggle = (changeId, pressed) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (pressed) next.add(changeId);
      else next.delete(changeId);
      return next;
    });

  const readings = resolveUpcoming(requirements, enabled);
  const drifted = cap.upcoming?.driftedChanges ?? [];

  return (
    <VStack gap={4}>
      <Banner
        status="info"
        title="Not yet shipped"
        description={`A preview of ${cap.capability} with every enabled change below folded onto the baseline — a guess at what will fold cleanly, not a guarantee. The actual fold happens once at archive time.`}
      />

      {drifted.length > 0 && (
        <Banner
          status="warning"
          title={`${drifted.length} change${drifted.length === 1 ? "" : "s"} could not fold in`}
          description={drifted
            .map(
              (d) =>
                `${d.changeId}: ${d.drift.requirements.map((r) => `"${r}"`).join(", ")} ${
                  d.drift.requirements.length === 1 ? "does" : "do"
                } not match a requirement in the baseline, so ${d.drift.requirements.length === 1 ? "it" : "they"} could not be folded in and ${d.drift.requirements.length === 1 ? "is" : "are"} left out of the preview below.`,
            )
            .join(" ")}
        />
      )}

      {changes.length > 0 && (
        <HStack gap={2} wrap="wrap">
          {changes.map((changeId) => (
            <ToggleButton
              key={changeId}
              size="sm"
              label={changeId}
              isPressed={enabled.has(changeId)}
              onPressedChange={(pressed) => toggle(changeId, pressed)}
            />
          ))}
        </HStack>
      )}

      <VStack gap={3}>
        {readings.map((reading) => (
          <Requirement key={reading.heading} reading={reading} cap={cap} />
        ))}
      </VStack>
    </VStack>
  );
}

const OPERATION_LABEL = {
  ADDED: "ADDED",
  MODIFIED: "MODIFIED",
  REMOVED: "REMOVED",
};

const OPERATION_VARIANT = {
  ADDED: "info",
  MODIFIED: "warning",
  REMOVED: "neutral",
};

/** One requirement's reading: unchanged, folded by one change, or a disagreement between two. */
function Requirement({ reading, cap }) {
  if (reading.kind === "durable") {
    return (
      <Card padding={3}>
        <SpecText text={reading.text} prefix={cap.capability} lens="full" />
      </Card>
    );
  }

  if (reading.kind === "single") {
    const removed = reading.operation === "REMOVED";
    return (
      <Card padding={3}>
        <VStack gap={2}>
          <HStack gap={2} align="center" wrap="wrap">
            <Badge
              variant={OPERATION_VARIANT[reading.operation]}
              label={`${OPERATION_LABEL[reading.operation]} · via ${reading.changeId}`}
            />
          </HStack>
          <div className={removed ? "upcoming-removed" : undefined}>
            <SpecText
              text={removed ? reading.baselineText : reading.text}
              prefix={cap.capability}
              lens="full"
            />
          </div>
        </VStack>
      </Card>
    );
  }

  // disagreement: two or more enabled changes touch the same heading, shown side by side
  // rather than folded into a guess at which one wins.
  return (
    <Card padding={3}>
      <VStack gap={3}>
        <Banner
          status="warning"
          title="These changes disagree here"
          description={`${reading.touches.length} in-development changes touch "${reading.heading}" — not merged, so neither is shown as the answer.`}
        />
        {reading.touches.map((touch) => {
          const removed = touch.operation === "REMOVED";
          return (
            <VStack key={touch.changeId} gap={2}>
              <Badge
                variant={OPERATION_VARIANT[touch.operation]}
                label={`${OPERATION_LABEL[touch.operation]} · via ${touch.changeId}`}
              />
              <div className={removed ? "upcoming-removed" : undefined}>
                <SpecText
                  text={removed ? reading.baselineText : touch.text}
                  prefix={cap.capability}
                  lens="full"
                />
              </div>
            </VStack>
          );
        })}
      </VStack>
    </Card>
  );
}
