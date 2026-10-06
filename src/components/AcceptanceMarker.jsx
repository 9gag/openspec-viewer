import { Badge } from "@astryxdesign/core/Badge";
import { HStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";

/**
 * The planning acceptance state is separate from implementation progress. The server
 * sends the immutable acceptance record when a change has been accepted and `null`
 * while it is still waiting for a human decision.
 */
export function AcceptanceMarker({
  acceptance,
  proposedAt,
  showDetails = false,
  archived = false,
}) {
  const accepted = Boolean(acceptance);
  const label = accepted
    ? "accepted"
    : archived
      ? "acceptance unrecorded"
      : "not accepted";
  const title = accepted
    ? "This change has been accepted"
    : archived
      ? "No acceptance record is available for this archived change"
      : "This change is not accepted";

  return (
    <HStack
      as="span"
      gap={1}
      align="center"
      wrap="wrap"
      title={title}
    >
      <Badge
        variant={accepted ? "success" : archived ? "neutral" : "warning"}
        label={label}
      />
      {showDetails && proposedAt && (
        <Text size="sm" color="secondary" hasTabularNumbers>
          proposed {proposedAt}
        </Text>
      )}
      {showDetails && accepted && acceptance.reviewedBy && (
        <Text size="sm" color="secondary">
          reviewed by {acceptance.reviewedBy}
        </Text>
      )}
      {showDetails && accepted && acceptance.acceptedAt && (
        <Timestamp
          value={acceptance.acceptedAt}
          format="system_date"
          size="sm"
          color="secondary"
          hasTooltip
        />
      )}
    </HStack>
  );
}
