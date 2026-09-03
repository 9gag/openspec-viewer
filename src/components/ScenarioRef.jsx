import { Badge } from "@astryxdesign/core/Badge";
import { Code } from "@astryxdesign/core/Code";
import { HoverCard } from "@astryxdesign/core/HoverCard";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Link } from "@astryxdesign/core/Link";
import { Text } from "@astryxdesign/core/Text";
import { createContext, useContext } from "react";

import { href } from "../api.js";
import { docHref } from "../links.js";
import { splitSpec } from "../bdd.js";

/**
 * The ids a page can resolve, for whatever it renders inside it.
 *
 * A scenario id is written down in one place and cited from everywhere else — a task, a
 * journey, a test case, a design doc. On the page those citations are bare monospace
 * strings: `shared-console-audit-SC-01` tells a reader that a scenario governs this task
 * and nothing whatever about which one, so the only way to find out is to leave for the
 * spec, find it, and come back having lost the row you were reading.
 *
 * Held in context rather than passed down, because the citations are inside rendered
 * markdown — three or four components below whoever fetched the page, in documents this
 * code does not own the shape of.
 */
const Resolved = createContext(null);

export function ResolvedIds({ value, children }) {
  return <Resolved.Provider value={value}>{children}</Resolved.Provider>;
}

/** Where a scenario is read: its capability's page, or the change that is bringing it in. */
function target(at) {
  const page =
    at.scope === "baseline" && at.capability
      ? href("spec", at.capability)
      : at.change
        ? href("change", at.change)
        : docHref(at.path);

  // `?at=` travels in the query because the fragment is already the route. It opens the
  // requirement holding the scenario whatever the reading, and scrolls to it.
  return `?at=${encodeURIComponent(at.id)}${page}`;
}

/** Where it lives, said in the words the rest of the dashboard uses for the same places. */
const WHERE = {
  baseline: { label: "in production", variant: "neutral" },
  development: { label: "in development", variant: "info" },
  archive: { label: "shipped", variant: "neutral" },
};

/** The scenario under the cursor: what it is called, and what it checks. */
function Preview({ at }) {
  const where = WHERE[at.scope] ?? WHERE.baseline;

  return (
    <VStack gap={2} className="ref-preview">
      <HStack gap={2} align="center" wrap="wrap">
        <Badge variant={where.variant} label={where.label} />
        <Text size="sm" color="secondary">
          {at.capability ?? at.change}
        </Text>
      </HStack>
      <Text weight="medium">{at.title || at.id}</Text>
      {/* Parsed by the same reader the spec page uses, so a preview shows a scenario the
          way the document it came from shows it — keywords and all. A preview that
          renders GIVEN/WHEN/THEN as grey prose is something the reader has to translate
          back before it answers anything. */}
      {splitSpec(at.steps.join("\n")).map((block, i) =>
        block.type === "steps" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: positions in one parsed scenario, which does not reorder
          <VStack key={i} gap={0}>
            {block.steps.map((step, at2) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: same
              <HStack key={at2} gap={2} align="baseline">
                <span className={`bdd-keyword bdd-${step.kind}`}>
                  {step.keyword}
                </span>
                <Text size="sm">{step.text}</Text>
              </HStack>
            ))}
          </VStack>
        ) : null,
      )}
    </VStack>
  );
}

/**
 * Inline code that turns out to be an id this store defines.
 *
 * Everything else is left as code, which is what it is. Nothing announces which of the two
 * a given span is until the pointer is over it — a page of citations underlined in link
 * blue would put the loudest thing on the row on the part of it that is a cross-reference.
 */
export default function ScenarioRef({ children, size }) {
  const resolved = useContext(Resolved);
  const text = typeof children === "string" ? children : null;
  const at = text ? resolved?.[text.toLowerCase()] : null;

  if (!at) return <Code size={size}>{children}</Code>;

  return (
    <HoverCard content={<Preview at={at} />} placement="above">
      <Link href={target(at)} type="inherit" className="ref-link">
        <Code size={size}>{children}</Code>
      </Link>
    </HoverCard>
  );
}
