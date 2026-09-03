import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Text } from "@astryxdesign/core/Text";

/**
 * Whether the ids on this page point at anything.
 *
 * The store issues every scenario and story a permanent id and then cites it from
 * everywhere else — a journey's Accepted by, a task naming the scenario it makes pass, a
 * test case's trace. That is a join written in prose, and a citation that resolves to
 * nothing looks exactly like one that resolves.
 */

/** The badge, beside the one that says whether the change validates. */
export function ReferenceBadge({ references }) {
  if (!references) return null;
  const broken = references.unresolved.length + references.duplicates.length;

  return (
    <Badge
      variant={broken === 0 ? "success" : "error"}
      label={
        broken === 0
          ? "ids resolve"
          : `${broken} id${broken === 1 ? "" : "s"} to fix`
      }
    />
  );
}

/** Occurrences folded to one row per id: sixty-five ids cited twice each is not 130 problems. */
function byId(unresolved) {
  const rows = new Map();
  for (const one of unresolved) {
    if (!rows.has(one.id)) rows.set(one.id, { ...one, at: [], count: 0 });
    const row = rows.get(one.id);
    row.count++;
    if (row.at.length < 3)
      row.at.push(`${one.path.split("/").pop()}:${one.line}`);
  }
  return [...rows.values()];
}

const SHOWN = 12;

export default function References({ references }) {
  if (!references) return null;
  const { unresolved, duplicates } = references;
  if (unresolved.length === 0 && duplicates.length === 0) return null;

  const rows = byId(unresolved);

  return (
    <VStack gap={3}>
      {rows.length > 0 && (
        <Banner
          status="error"
          container="card"
          title={`${rows.length} id${rows.length === 1 ? "" : "s"} here name nothing in the store`}
          description={
            <VStack gap={2}>
              <Text size="sm">
                A task, a journey or a test case is pointing at a scenario that
                does not exist under that name, so whatever it claims as
                evidence cannot be found.
              </Text>
              <VStack gap={1}>
                {rows.slice(0, SHOWN).map((row) => (
                  <HStack key={row.id} gap={2} align="baseline" wrap="wrap">
                    <Text size="sm" className="mono">
                      {row.id}
                    </Text>
                    <Text size="sm" color="secondary">
                      {row.at.join(", ")}
                      {row.count > row.at.length &&
                        ` +${row.count - row.at.length}`}
                    </Text>
                    {/* The prefix a capability issues is long, and the id written from
                        memory is its tail — so the answer is usually not "no such
                        scenario" but "you dropped the front of it". */}
                    {row.meant && (
                      <Text size="sm" color="secondary">
                        did you mean <span className="mono">{row.meant}</span>?
                      </Text>
                    )}
                  </HStack>
                ))}
                {rows.length > SHOWN && (
                  <Text size="sm" color="secondary">
                    and {rows.length - SHOWN} more.
                  </Text>
                )}
              </VStack>
            </VStack>
          }
        />
      )}

      {duplicates.length > 0 && (
        <Banner
          status="error"
          container="card"
          title={`${duplicates.length} id${duplicates.length === 1 ? "" : "s"} issued twice`}
          description={
            <VStack gap={2}>
              <Text size="sm">
                An id is permanent, so two scenarios sharing one do not collide
                — every task, review and test pointing at it now reaches
                whichever a reader finds first.
              </Text>
              <VStack gap={1}>
                {duplicates.map((one) => (
                  <Text key={`${one.path}:${one.id}`} size="sm">
                    <span className="mono">{one.id}</span>
                    <Text size="sm" color="secondary" as="span">
                      {" "}
                      on lines {one.lines.join(", ")} of{" "}
                      {one.path.split("/").pop()}
                    </Text>
                  </Text>
                ))}
              </VStack>
            </VStack>
          }
        />
      )}
    </VStack>
  );
}
