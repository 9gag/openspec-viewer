import { Badge } from "@astryxdesign/core/Badge";
import { Code } from "@astryxdesign/core/Code";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { LENSES } from "../spec.js";
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
export function Artifact({
  text,
  commit,
  path,
  bdd = false,
  prefix = "",
  lens,
}) {
  if (!text)
    return <Text color="secondary">This artifact does not exist yet.</Text>;

  return (
    <VStack gap={3}>
      <FileMeta path={path} commit={commit} />
      <div className="artifact">
        {/* headingLevelStart=2: the page already owns the h1. `path` doubles as the base
            for resolving this document's own relative links. */}
        {bdd ? (
          <SpecText text={text} prefix={prefix} base={path} lens={lens} />
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

/**
 * Which of the three readings of a spec is on screen.
 *
 * On the page rather than inside the document, because a change deltas several
 * capabilities and one control over all of them is the question the reader is actually
 * asking — "show me the requirements" is not a question per capability.
 */
export function LensControl({ value, onChange }) {
  return (
    <SegmentedControl
      value={value}
      onChange={onChange}
      label="Reading"
      size="sm"
    >
      {LENSES.map((l) => (
        <SegmentedControlItem key={l.value} value={l.value} label={l.label} />
      ))}
    </SegmentedControl>
  );
}

/**
 * What a row says instead of a requirement count.
 *
 * "no baseline" rather than "unshipped" because the row is stating a fact about the store
 * — there is nothing in `openspec/specs/` to read — where "unshipped" is the state that
 * fact puts the capability in. Retired says the state, because there is no fact plainer
 * than it: the store withdrew the behavior.
 */
const STATE_WORD = {
  unshipped: "no baseline",
  retired: "retired",
};

export function CapabilitySize({ cap }) {
  return (
    <Text size="sm" color="secondary" hasTabularNumbers>
      {cap.state === "shipped"
        ? `${cap.requirements} req · ${cap.scenarios} sc`
        : STATE_WORD[cap.state]}
    </Text>
  );
}

/**
 * Whether a change is rewriting this capability, and the warning when two are.
 *
 * Shared by the index and by a namespace's own page, because it is the same sentence
 * about the same fact — and because two of them is the conflict the board raises, which
 * nothing should be able to say quietly on one page and loudly on another.
 *
 * Nothing at all for a capability nobody is touching: three quarters of a catalogue is
 * that, and a badge on every row would bury the ones that need an answer.
 */
export function CapabilityFlag({ cap }) {
  if (!cap.inDevelopment) return null;
  return (
    <Badge
      variant={cap.inDevelopment > 1 ? "warning" : "info"}
      label={
        cap.inDevelopment > 1
          ? `${cap.inDevelopment} in development`
          : "in development"
      }
    />
  );
}
