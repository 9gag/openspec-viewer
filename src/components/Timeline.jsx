import { HStack } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";

/**
 * A list that is read in order: when down one column, a dot on a running line, the entry
 * itself on the other side.
 *
 * Two pages ask the same question of the store — what happened to this capability, and
 * what has shipped — and both answers are a sequence of dated changes. Squaring the dates
 * off into their own column is what makes the sequence legible; a row that opens with a
 * ragged change id hides the very thing it is ordered by.
 *
 * `roomy` for entries that run to more than one line, where the spacing that separates
 * one-line rows no longer separates anything.
 */
export function Timeline({ roomy = false, children }) {
  return (
    <ol className={roomy ? "timeline timeline-roomy" : "timeline"}>
      {children}
    </ol>
  );
}

/**
 * One entry.
 *
 * `when` is a word as readily as a date — a change still in development has no date and sits
 * at the live end of the line, which the column says better than a badge could. `state`
 * names what the dot means, since colour alone is not an answer to a screen reader.
 */
export function TimelineEntry({ when, state, variant = "neutral", children }) {
  return (
    <li className="timeline-item">
      <div className="timeline-when">
        <Text size="sm" color="secondary" hasTabularNumbers>
          {when}
        </Text>
      </div>
      <div className="timeline-track">
        <StatusDot variant={variant} label={state} />
        <span className="timeline-line" aria-hidden="true" />
      </div>
      <div className="timeline-body">{children}</div>
    </li>
  );
}

/** The first line of an entry: what it is, then whatever qualifies it. */
export function TimelineHead({ children }) {
  return (
    <HStack gap={2} align="center" wrap="wrap">
      {children}
    </HStack>
  );
}
