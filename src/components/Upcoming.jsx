import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { useState } from "react";

import { buildUpcomingText, changesTouching, disagreementCount } from "../upcoming.js";
import { Artifact, LensControl } from "./bits.jsx";
import WithOutline from "./WithOutline.jsx";

/**
 * `spec/<id>`'s Upcoming reading: the same document Durable shows, with every enabled
 * in-development change on the capability folded onto it at once (see `server/upcoming.mjs`
 * and `src/upcoming.js`) — same headings, same order, same Purpose section, so switching
 * the toggle never reorients a reader, only changes what a requirement says.
 *
 * Owns which changes are enabled itself, keyed by the caller on the capability id — a
 * fresh capability is a fresh chip row, all on, and a `key` remount says that for free
 * instead of an effect watching for the id to change.
 */
export default function Upcoming({ cap, lens, onLens }) {
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

  const text = buildUpcomingText(cap.text, requirements, enabled);
  const drifted = cap.upcoming?.driftedChanges ?? [];
  const disagreements = disagreementCount(requirements, enabled);

  // A fragment, not a VStack: `.doc-page > :not(.with-outline)` is what holds every card on
  // the page to the same column and lets `.with-outline` alone run the full column-plus-rail
  // width. A wrapping element here would be *that* child instead of `.with-outline`, capping
  // the rail's own grid to the narrower width from inside — which is exactly what shipped
  // first, and why the rail sat pinched against the text instead of out at the page's edge.
  return (
    <>
      <Banner
        status="info"
        title="Not yet shipped"
        description={`A preview of ${cap.capability} with every enabled change below folded onto the baseline — a guess at what will fold cleanly, not a guarantee. The actual fold happens once at archive time.${disagreements > 0 ? ` ${disagreements} requirement${disagreements === 1 ? "" : "s"} below ${disagreements === 1 ? "is" : "are"} touched by more than one enabled change and marked as a disagreement rather than folded.` : ""}`}
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

      {text ? (
        <WithOutline>
          <Card padding={4}>
            <VStack gap={3}>
              <HStack hAlign="end">
                <LensControl value={lens} onChange={onLens} />
              </HStack>
              <Artifact text={text} bdd prefix={cap.capability} lens={lens} />
            </VStack>
          </Card>
        </WithOutline>
      ) : (
        <EmptyState
          title="Nothing to preview"
          description="Every chip above is disabled, and this capability has no baseline of its own to fall back to."
          isCompact
        />
      )}
    </>
  );
}
