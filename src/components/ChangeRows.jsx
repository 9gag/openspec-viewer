import { Badge } from "@astryxdesign/core/Badge";
import { Text } from "@astryxdesign/core/Text";
import { href } from "../api.js";
import { leafOf, namespaceOf, TOP_LEVEL } from "../capabilities.js";
import { displayName } from "../names.js";
import { ago, exact, STALE_DAYS } from "../time.js";
import { Progress } from "./bits.jsx";

/**
 * The changes filed directly under one namespace.
 *
 * Ids rather than the nav's sentences, whatever the name toggle says: the heading above is
 * a place and reads as prose, and the row underneath is the thing you paste into the CLI.
 *
 * Every column is fixed but the id, so the counts, the owners and the ages line up down
 * the whole column — the reason the capability index fixes its own.
 */
export function ChangeRows({ changes, conflicting, plainNames, band, within }) {
  return (
    <div>
      {changes.map((ch) => {
        const flag = conflicting.has(ch.id)
          ? "conflict"
          : ch.total > 0 && ch.done === ch.total
            ? "ready"
            : undefined;

        return (
          <a
            key={ch.id}
            className="simple-row"
            data-flag={flag}
            href={href("change", ch.id)}
          >
            <span className="simple-row-name">
              {/* The id carries its own title: a long one against a conflict badge and
                  an "also" note runs out of column, and an id truncated with nothing to
                  hover is a row you cannot identify. */}
              <Text
                className="simple-row-id"
                weight="medium"
                size="sm"
                title={ch.id}
              >
                {ch.id}
              </Text>
              {/* Warning, not error, and the same word the tile counts by: the change is
                  not broken, it is unsafe to archive without reading the banner that
                  names the capability and the change on the other side of it. */}
              {conflicting.has(ch.id) && (
                <Badge variant="warning" label="conflict" />
              )}
              <Elsewhere change={ch} band={band} plainNames={plainNames} />
            </span>

            <Text size="sm" color="secondary" className="simple-row-owner">
              {owners(ch)}
            </Text>

            <Text
              size="sm"
              color="secondary"
              hasTabularNumbers
              className="simple-row-count"
            >
              {/* A change still being planned has no tasks.md to count, and 0/0 read as
                  work that had not started rather than work not yet written down. */}
              {ch.planning ? "planning" : `${ch.done}/${ch.total}`}
            </Text>

            {ch.planning ? (
              <span />
            ) : (
              <Progress
                done={ch.done}
                total={ch.total}
                label={`${ch.id} progress`}
              />
            )}

            <Text size="sm" color="secondary" className="simple-row-age">
              <Stalled at={ch.lastActivity} />
            </Text>
          </a>
        );
      })}
    </div>
  );
}

/**
 * Who is on it, in the width of a column.
 *
 * A change is claimed a task group at a time, so "the owner" is however many people have
 * claimed one. Named while there is one, counted once there are more: three handles do
 * not fit and would not be read if they did.
 */
function owners(change) {
  const held = [
    ...new Set((change.groups ?? []).map((g) => g.owner).filter(Boolean)),
  ];
  if (held.length === 0) return "unassigned";
  if (held.length === 1) return `@${held[0]}`;
  return `@${held[0]} +${held.length - 1}`;
}

/**
 * Where else this change is filed.
 *
 * Never the band it is already under — that would be the row telling the reader where
 * they are. It exists because the same id appearing twice on one page reads as a
 * duplicate until something says it is one change seen from its other capability, and a
 * reader who has just been told a namespace holds ten changes should not have to count
 * eleven rows and wonder which of them is a bug.
 *
 * The first one named and the rest counted: a change deltaing four namespaces is rare,
 * and naming all four would push the id it belongs to out of the row.
 */
function Elsewhere({ change, band, plainNames }) {
  const spaces = [
    ...new Set(
      (change.capabilities ?? []).map((c) => namespaceOf(c) ?? TOP_LEVEL),
    ),
  ].filter((ns) => ns !== band);

  if (spaces.length === 0) return null;

  const first = displayName(leafOf(spaces[0]), plainNames);
  const rest = spaces.length > 1 ? ` +${spaces.length - 1}` : "";

  return (
    // The leaf is all that fits, and two namespaces can share one ("auction" lives under
    // both applications), so the full paths ride along in the title for the reader the
    // short name leaves guessing.
    <Text
      size="sm"
      color="secondary"
      className="simple-row-else"
      title={`also filed under ${spaces.join(", ")}`}
    >
      also {first}
      {rest}
    </Text>
  );
}

/**
 * When a change last moved, and only once that has been long enough to notice.
 *
 * Empty while work is happening, so the column reads as the list of things that have
 * stopped rather than a date beside every row. The threshold is the store's own: past it,
 * the full board is already calling a claim on it stale.
 */
function Stalled({ at }) {
  if (!at) return null;
  const days = (Date.now() - at) / 86400000;
  if (days < STALE_DAYS) return null;
  return <span title={`last commit ${exact(at)}`}>{ago(at)}</span>;
}
