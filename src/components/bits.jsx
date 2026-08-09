import { Badge } from "@astryxdesign/core/Badge";
import { Code } from "@astryxdesign/core/Code";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { exact, iso, level } from "../time.js";
import { mdComponents } from "./markdown.jsx";
import SpecText from "./SpecText.jsx";

/** Owner tag, or the absence of one — unassigned is a state, not missing data. */
export function Owner({ handle }) {
  if (!handle) {
    return (
      <Text size="sm" color="secondary">
        unassigned
      </Text>
    );
  }
  return <Badge variant="neutral" label={`@${handle}`} />;
}

/**
 * How long a claim has sat without progress.
 *
 * A dash when history cannot account for the current owner — inventing an age from
 * missing history would aim the nudge at the wrong person, so the cell stays honestly
 * empty. Severity rides on a Badge rather than text colour, because Astryx's TextColor
 * has no error/warning member and a themed badge survives a theme swap.
 */
export function Idle({ idle }) {
  if (!idle) {
    return (
      <Text size="sm" color="secondary">
        —
      </Text>
    );
  }

  const what = idle.source === "progress" ? "last checkmark" : "claimed";
  const tone = level(idle);

  const stamp = (
    <Timestamp
      value={iso(idle.since)}
      format="relative"
      size="sm"
      color="secondary"
      hasTooltip
    />
  );

  if (tone === "fresh") {
    return (
      <HStack gap={1} align="center" title={`${what} ${exact(idle.since)}`}>
        <Text size="sm" color="secondary">
          {what}
        </Text>
        {stamp}
      </HStack>
    );
  }

  return (
    <HStack gap={1} align="center" title={`${what} ${exact(idle.since)}`}>
      <Badge
        variant={tone === "stale" ? "error" : "warning"}
        label={tone === "stale" ? "idle" : "quiet"}
      />
      <Text size="sm" color="secondary">
        {what}
      </Text>
      {stamp}
    </HStack>
  );
}

export function Progress({ done, total, label }) {
  return (
    <ProgressBar
      value={done}
      max={Math.max(total, 1)}
      label={label}
      isLabelHidden
      variant={total > 0 && done === total ? "success" : "accent"}
    />
  );
}

/** State of one task group, as a word rather than a colour alone. */
export function GroupState({ done, total }) {
  if (total === 0) return <Badge variant="neutral" label="empty" />;
  if (done === total) return <Badge variant="success" label="done" />;
  if (done > 0) return <Badge variant="info" label="in progress" />;
  return <Badge variant="warning" label="not started" />;
}

/** A command to run, since the dashboard never writes to the store itself. */
export function Command({ children }) {
  return <Code size="sm">{children}</Code>;
}

/** Where a file lives in the store, and when it last changed. */
export function FileMeta({ path, commit }) {
  if (!path && !commit) return null;
  return (
    <HStack gap={2} align="center" wrap="wrap">
      {path && (
        <Text size="sm" color="secondary" className="mono">
          {path}
        </Text>
      )}
      {commit && (
        <HStack gap={1} align="center">
          <Text size="sm" color="secondary" className="mono">
            {commit.sha}
          </Text>
          <Timestamp
            value={iso(commit.at)}
            format="relative"
            size="sm"
            color="secondary"
            hasTooltip
          />
        </HStack>
      )}
    </HStack>
  );
}

/**
 * One of the store's markdown artifacts, rendered.
 *
 * `bdd` opts into scenario and obligation highlighting. Off by default because proposals
 * and design docs are ordinary prose — colouring a stray "must" in a proposal would imply
 * a normative weight the document does not carry.
 */
export function Artifact({ text, commit, path, bdd = false, prefix = "" }) {
  if (!text)
    return <Text color="secondary">This artifact does not exist yet.</Text>;

  return (
    <VStack gap={3}>
      <FileMeta path={path} commit={commit} />
      <div className="artifact">
        {/* headingLevelStart=2: the page already owns the h1. `path` doubles as the base
            for resolving this document's own relative links. */}
        {bdd ? (
          <SpecText text={text} prefix={prefix} base={path} />
        ) : (
          <Markdown
            headingLevelStart={2}
            components={mdComponents({ prefix, base: path })}
          >
            {text}
          </Markdown>
        )}
      </div>
    </VStack>
  );
}
