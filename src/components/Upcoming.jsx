import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { ToggleButton } from "@astryxdesign/core/ToggleButton";
import { useState } from "react";

import {
  buildUpcomingText,
  changesTouching,
  upcomingDocVersions,
  upcomingKinds,
} from "../upcoming.js";
import { Artifact, LensControl } from "./bits.jsx";
import WithOutline from "./WithOutline.jsx";

const DOC_LABEL = {
  shipped: "Shipped",
  pending: "Not yet shipped",
  disagreement: "Not yet shipped",
};

/** A badge only for a version that isn't the shipped one. */
const DOC_BADGE = {
  pending: { label: "PENDING", variant: "blue" },
  disagreement: { label: "DISAGREEMENT", variant: "orange" },
};

/** One version of a document beside spec.md — the shipped one, an in-development change's
 * own copy, or one of several disagreeing over the same file, badged accordingly. */
function DocVersion({ version }) {
  const badge = DOC_BADGE[version.kind];
  return (
    <VStack gap={2}>
      <HStack gap={2} align="center" wrap="wrap">
        <Text size="sm" weight="medium" color="secondary">
          {DOC_LABEL[version.kind]}
          {version.changeId ? ` · via ${version.changeId}` : ""}
        </Text>
        {badge && <Badge variant={badge.variant} label={badge.label} />}
      </HStack>
      <Artifact text={version.text} prefix={version.changeId ?? "shipped"} />
    </VStack>
  );
}

/**
 * `spec/<id>`'s Upcoming reading: the same document Durable shows — spec.md, or whichever
 * of its documents is the active tab — with every enabled in-development change on the
 * capability folded onto it (see `server/upcoming.mjs` and `src/upcoming.js`). Same
 * headings, same order, same Purpose section for spec.md; a document beside it has no such
 * paragraph to fold, so every version present is shown in full instead. Either way, a
 * touched section is badged by what happened to it — ADDED, MODIFIED, REMOVED, or a
 * disagreement between changes — so a reader scanning the page finds what changed without
 * reading every line.
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

  const specText = doc ? null : buildUpcomingText(cap.text, cap.upcoming?.requirements, enabled);
  const kinds = doc ? null : upcomingKinds(cap.upcoming?.requirements, enabled);
  // Shared by the heading's own badge and the outline rail's copy of it, so a reader
  // scanning "On this page" sees exactly what opening the requirement would show.
  const annotate = doc ? undefined : (title) => kinds.get(title.trim());
  const docVersions = doc
    ? upcomingDocVersions(
        doc.text,
        cap.upcoming?.docs?.find((d) => d.name === doc.name)?.versions,
        enabled,
      )
    : null;

  const hasContent = doc ? docVersions.length > 0 : Boolean(specText);
  const docsDisagree = doc && docVersions.some((v) => v.kind === "disagreement");

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

      {docsDisagree && (
        <Banner
          status="warning"
          title="These changes disagree here"
          description={`More than one enabled change carries its own copy of ${doc.label}. Not merged, so every version is shown below rather than one chosen for you.`}
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

      {hasContent ? (
        <WithOutline annotate={annotate}>
          <Card padding={4}>
            {doc ? (
              <VStack gap={4}>
                {docVersions.map((version) => (
                  <DocVersion key={version.changeId ?? "shipped"} version={version} />
                ))}
              </VStack>
            ) : (
              <VStack gap={3}>
                <HStack hAlign="end">
                  <LensControl value={lens} onChange={onLens} />
                </HStack>
                <Artifact
                  text={specText}
                  bdd
                  prefix={cap.capability}
                  lens={lens}
                  annotate={annotate}
                />
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
