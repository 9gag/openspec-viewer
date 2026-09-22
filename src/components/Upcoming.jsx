import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { useState } from "react";

import {
  buildUpcomingDocText,
  buildUpcomingText,
  changesTouching,
} from "../upcoming.js";
import { Artifact, LensControl } from "./bits.jsx";
import WithOutline from "./WithOutline.jsx";

/**
 * `spec/<id>`'s Upcoming reading: the same document Durable shows — spec.md, or whichever
 * of its documents is the active tab — with every enabled in-development change on the
 * capability folded onto it (see `server/upcoming.mjs` and `src/upcoming.js`). Same
 * headings, same order, same Purpose section for spec.md; a document beside it has no such
 * paragraph to fold, so every version present is shown in full instead.
 *
 * Mounted once per capability regardless of which tab is active — `doc` is a prop that
 * changes underneath it, not something that remounts it — so which changes are enabled
 * survives switching between spec.md and its documents. Only a fresh capability, keyed by
 * the caller, gets a fresh chip row, all on.
 */
export default function Upcoming({ cap, doc, lens, onLens }) {
  const changes = changesTouching(cap.upcoming);
  const [enabled, setEnabled] = useState(() => new Set(changes));

  const toggle = (changeId, pressed) =>
    setEnabled((prev) => {
      const next = new Set(prev);
      if (pressed) next.add(changeId);
      else next.delete(changeId);
      return next;
    });

  const drifted = doc ? [] : (cap.upcoming?.driftedChanges ?? []);

  const text = doc
    ? buildUpcomingDocText(
        doc.text,
        cap.upcoming?.docs?.find((d) => d.name === doc.name)?.versions,
        enabled,
      )
    : buildUpcomingText(cap.text, cap.upcoming?.requirements, enabled);

  return (
    <>
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

      {text ? (
        <WithOutline>
          <Card padding={4}>
            {doc ? (
              <Artifact text={text} prefix={doc.name} />
            ) : (
              <VStack gap={3}>
                <HStack hAlign="end">
                  <LensControl value={lens} onChange={onLens} />
                </HStack>
                <Artifact text={text} bdd prefix={cap.capability} lens={lens} />
              </VStack>
            )}
          </Card>
        </WithOutline>
      ) : (
        <EmptyState
          title="Nothing to preview"
          description="Every chip above is disabled, and there is no shipped version to fall back to."
          isCompact
        />
      )}
    </>
  );
}
