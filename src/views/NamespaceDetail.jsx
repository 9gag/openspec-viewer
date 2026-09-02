import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { VStack } from "@astryxdesign/core/Layout";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { href, useApi } from "../api.js";
import { isUnder, namespaceOf } from "../capabilities.js";
import { CapabilityFlag, CapabilitySize } from "../components/bits.jsx";
import { ChangeRows } from "../components/ChangeRows.jsx";
import { NamespacePath } from "../components/NamespacePath.jsx";
import { conflictingChanges, summarize } from "../summary.js";

/**
 * One namespace: what is shipped in it, and what is being built in it.
 *
 * A namespace was the one piece of structure in this store with no page of its own. It
 * heads a band on the board, a band in the catalogue, two trees in the nav and the title
 * of every change page — and until now the only thing a reader could do with it was read
 * it. Everything else the store names opens: a change, a capability, a document.
 *
 * Both halves, because a namespace holds both and the question behind the click is not
 * the same for everyone who asks it. "What does this area already cover" is answered by
 * the capabilities; "what else is being built here" is answered by the changes, and that
 * second one is the softer version of the warning the board only raises once two changes
 * write the *same* capability. Seeing the five other changes in an area is how that gets
 * noticed a week earlier.
 *
 * Everything below the namespace, not only what is filed directly at it: the reader who
 * opens a product wants the product, and a page that showed nothing because the changes
 * are all one level down would be a page that answers no question at all.
 *
 * No endpoint of its own. Both lists are filters over what the board and the catalogue
 * already return, and both are already fetched to draw the nav — a namespace is a way of
 * looking at the store rather than a thing stored in it.
 */
export default function NamespaceDetail({ id, plainNames }) {
  const { data: board, error: boardError, loading } = useApi("/api/board");
  const { data: catalog } = useApi("/api/specs", { poll: false });

  if (loading && !board) return <Spinner label={`Reading ${id}`} />;
  if (boardError) {
    return (
      <Banner
        status="error"
        container="card"
        title={`Cannot read ${id}`}
        description={boardError}
      />
    );
  }

  const changes = board.changes.filter((ch) =>
    (ch.capabilities ?? []).some((c) => isUnder(id, namespaceOf(c))),
  );
  const caps = (catalog?.specs ?? []).filter((c) =>
    isUnder(id, namespaceOf(c.capability)),
  );
  const conflicting = conflictingChanges(summarize(board).conflicts);

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <Heading level={1} className="ns-line">
          <NamespacePath path={id} current={id} />
        </Heading>
      </VStack>

      <Section
        title="In development"
        count={changes.length}
        empty="Nothing is being built in this namespace right now."
      >
        <ChangeRows
          changes={changes}
          conflicting={conflicting}
          plainNames={plainNames}
          within={id}
        />
      </Section>

      <Section
        title="Capabilities"
        count={caps.length}
        empty="No capability is filed under this namespace yet."
      >
        <div>
          {caps.map((cap) => (
            <Capability key={cap.capability} cap={cap} within={id} />
          ))}
        </div>
      </Section>
    </VStack>
  );
}

function Section({ title, count, empty, children }) {
  return (
    <section className="cap-group">
      <div className="cap-ns">
        <Text weight="semibold">{title}</Text>
        <Badge variant="neutral" label={String(count)} />
        <span className="cap-ns-rule" aria-hidden="true" />
      </div>
      <div className="cap-group-body">
        {count > 0 ? (
          children
        ) : (
          <Text size="sm" color="secondary">
            {empty}
          </Text>
        )}
      </div>
    </section>
  );
}

/**
 * One capability under this namespace.
 *
 * Deliberately not the catalogue's row, which carries the two buttons and the anchored
 * "changed by" panel that page is built around. This is a list of what is here, and a row
 * of controls per line would make it read as the catalogue with a filter on it rather
 * than as an answer to "what is in this namespace".
 *
 * The name is the part of the path this namespace has not already said — under
 * `storefront → checkout`, a capability called `storefront/checkout/bid-payment` is
 * `bid-payment`, and repeating the rest on every row would push the one word that
 * distinguishes them off to the right.
 */
function Capability({ cap, within }) {
  return (
    <a className="simple-row ns-cap-row" href={href("spec", cap.capability)}>
      <span className="simple-row-name">
        <Text
          className="simple-row-id"
          weight="medium"
          size="sm"
          title={cap.capability}
        >
          {cap.capability.slice(within.length + 1)}
        </Text>
        <CapabilityFlag cap={cap} />
      </span>

      <span className="ns-cap-size">
        <CapabilitySize cap={cap} />
      </span>
    </a>
  );
}
