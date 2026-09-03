import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useMemo, useState } from "react";

import { splitSpec } from "../bdd.js";
import {
  DEFAULT_LENS,
  lensRules,
  linkedScenario,
  parseSpec,
  scenarioAnchor,
  scenarioIndex,
} from "../spec.js";
import { anchor } from "../toc.js";
import CopyLink from "./CopyLink.jsx";
import { mdComponents } from "./markdown.jsx";

/**
 * A spec, rendered so the load-bearing words are visible and the bulk is optional.
 *
 * Astryx's Markdown lets you override the paragraph, heading, code and link renderers, but
 * not lists — and OpenSpec writes every scenario step as a list item (`- **WHEN** …`),
 * which is exactly where the keywords live. So the step runs are pulled out and rendered
 * here, and everything else still goes through Markdown untouched.
 *
 * The document is also split at its own headings (see `parseSpec`) so a requirement's
 * scenarios can be folded away. Four fifths of a spec is Given/When/Then, and the reader
 * who wants to know what a capability is held to is usually not the reader checking it.
 */

/**
 * One scenario's steps.
 *
 * Laid out as a keyword column rather than a coloured word inside a sentence: the point of
 * a scenario is that it reads as a sequence, and aligning the keywords makes the shape of
 * it visible before any of the words are read.
 */
function Steps({ steps }) {
  return (
    <VStack gap={1} paddingBlock={2}>
      {steps.map((step, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: the steps are positions in a parsed document, not a list that reorders
        <HStack key={i} gap={3} align="baseline">
          <span className={`bdd-keyword bdd-${step.kind}`}>{step.keyword}</span>
          <Text size="sm">{step.text}</Text>
        </HStack>
      ))}
    </VStack>
  );
}

/**
 * One reference to a scenario defined elsewhere in the document.
 *
 * `scenarios` is the other half of the join: when the id resolves, the scenario opens
 * where it was named, which is the whole point — a reader following a journey should not
 * have to take twenty-four ids on trust or scroll to each one.
 *
 * The title shown is the definition's, not the copy the reference carries. They are the
 * same until someone renames a scenario and misses a reference, and at that point the
 * definition is the one telling the truth.
 */
function Ref({ id, title, scenario, components }) {
  const [isOpen, setOpen] = useState(false);

  const label = (
    <span className="ref">
      <span className="scenario-id">{id}</span>
      <Text size="sm" as="span">
        {scenario?.title || title}
      </Text>
    </span>
  );

  // Nothing in this document defines it: a delta naming a scenario from the baseline, or
  // an id that has drifted. Rendered as the line it already was — a disclosure that opens
  // on nothing is a worse answer than a list, because it promises one.
  if (!scenario) return <div className="ref-row">{label}</div>;

  return (
    <div className="ref-row">
      <Collapsible isOpen={isOpen} onOpenChange={setOpen} trigger={label}>
        {/* Only while open, for the reason the requirement disclosures are: sixty-four
            scenario bodies that are not on screen should not be in the document either.
            No index is passed down — a scenario body is steps, and not handing it one is
            what makes a reference cycle unrepresentable rather than merely unlikely. */}
        {isOpen && (
          <VStack gap={1} className="ref-body">
            <Blocks text={scenario.text} components={components} />
            <Text size="xsm" color="secondary">
              Checks: {scenario.requirement}
            </Text>
          </VStack>
        )}
      </Collapsible>
    </div>
  );
}

/**
 * A run of references — a journey's "Accepted by", a delta's "Covers".
 *
 * Pulled out of the markdown for the same reason the step runs are: this is a list, and
 * Astryx's Markdown has no list renderer to override. The store writes these as bare ids,
 * which is a join table printed as a document.
 */
function Refs({ refs, scenarios, components }) {
  return (
    <VStack gap={0} className="refs">
      {refs.map((ref, i) => (
        <Ref
          // biome-ignore lint/suspicious/noArrayIndexKey: a document may name one scenario twice, and the position is what distinguishes the rows
          key={`${ref.id}-${i}`}
          id={ref.id}
          title={ref.title}
          scenario={scenarios?.get(ref.id.toLowerCase())}
          components={components}
        />
      ))}
    </VStack>
  );
}

/** Markdown, step runs and reference runs, in the order the document has them. */
function Blocks({ text, components, scenarios }) {
  if (!text?.trim()) return null;

  return (
    <VStack gap={0}>
      {splitSpec(text).map((block, i) => {
        // biome-ignore lint/suspicious/noArrayIndexKey: the blocks are positions in a parsed document, not a list that reorders
        const key = i;

        if (block.type === "steps")
          return <Steps key={key} steps={block.steps} />;

        if (block.type === "refs")
          return (
            <Refs
              key={key}
              refs={block.refs}
              scenarios={scenarios}
              components={components}
            />
          );

        return (
          <Markdown key={key} headingLevelStart={2} components={components}>
            {block.text}
          </Markdown>
        );
      })}
    </VStack>
  );
}

/**
 * One scenario, addressable.
 *
 * The store issues every scenario a permanent id so a task, a review or a test case can
 * name one — this is that id as somewhere to point: the heading carries it, and the button
 * copies a link that lands on it.
 */
function Scenario({ scenario, id, components }) {
  return (
    <section className="scenario" id={id}>
      <HStack gap={2} align="baseline" className="scenario-head">
        <Heading level={4}>
          {scenario.id && <span className="scenario-id">{scenario.id}</span>}
          {scenario.title}
        </Heading>
        <CopyLink
          search={`?at=${scenario.id ?? id}`}
          label={`Copy link to ${scenario.id ?? scenario.title}`}
        />
      </HStack>
      <Blocks text={scenario.text} components={components} />
    </section>
  );
}

/** One requirement, with its scenarios behind a disclosure. */
function Requirement({
  node,
  prefix,
  components,
  scenarios,
  isOpen,
  onOpenChange,
}) {
  const id = anchor(prefix, node.title);
  const count = node.scenarios.length;

  return (
    <section className="requirement">
      <Heading level={3} id={id}>
        {node.title}
      </Heading>
      <Blocks text={node.text} components={components} scenarios={scenarios} />

      {count > 0 && (
        <Collapsible
          isOpen={isOpen}
          onOpenChange={onOpenChange}
          trigger={
            <Text size="sm" color="secondary">
              {count} scenario{count === 1 ? "" : "s"}
            </Text>
          }
        >
          {/* Rendered only while open, rather than hidden by the disclosure: sixty-four
              scenarios that are not on screen should not be in the document either, and
              the outline rail reads the DOM — it would list every scenario heading on a
              page showing none of them. */}
          <VStack gap={0}>
            {isOpen &&
              node.scenarios.map((scenario) => (
                <Scenario
                  key={scenarioAnchor(scenario, prefix)}
                  scenario={scenario}
                  id={scenarioAnchor(scenario, prefix)}
                  components={components}
                />
              ))}
          </VStack>
        </Collapsible>
      )}
    </section>
  );
}

export default function SpecText({
  text,
  prefix = "",
  base = "",
  lens = DEFAULT_LENS,
}) {
  const components = mdComponents({ prefix, bdd: true, base });
  const nodes = useMemo(() => parseSpec(text), [text]);
  // What the references in the prose resolve against. Built from the same parse, so a
  // reference can only ever open a scenario this page actually renders.
  const scenarios = useMemo(() => scenarioIndex(nodes, prefix), [nodes, prefix]);
  const rules = lensRules(lens);

  // Read once, on the way in: a link that names a scenario opens the requirement holding
  // it whatever the lens says, because the reader asked for that one thing by name.
  const asked = useMemo(() => linkedScenario(), []);
  const holding = useMemo(
    () =>
      asked
        ? nodes.find((n) =>
            n.scenarios?.some(
              (s) => scenarioAnchor(s, prefix) === asked.toLowerCase(),
            ),
          )?.title
        : null,
    [asked, nodes, prefix],
  );

  // Per-requirement overrides on top of the lens. Switching lens clears them: the lens is
  // the answer to "show me the scenarios", and a stale override would contradict it.
  const [opened, setOpened] = useState({});
  useEffect(() => setOpened({}), [lens]);

  useEffect(() => {
    if (!asked) return;
    // After the requirement holding it has opened, not before.
    const at = document.getElementById(asked.toLowerCase());
    at?.scrollIntoView({ block: "center" });
  }, [asked]);

  return (
    <VStack gap={0}>
      {nodes.map((node, i) =>
        node.kind === "prose" ? (
          rules.prose && (
            // biome-ignore lint/suspicious/noArrayIndexKey: the nodes are positions in a parsed document, not a list that reorders
            <Blocks
              key={i}
              text={node.text}
              components={components}
              scenarios={scenarios}
            />
          )
        ) : (
          <Requirement
            key={node.title}
            node={node}
            prefix={prefix}
            components={components}
            scenarios={scenarios}
            isOpen={
              opened[node.title] ??
              (node.title === holding ? true : rules.scenarios)
            }
            onOpenChange={(open) =>
              setOpened((was) => ({ ...was, [node.title]: open }))
            }
          />
        ),
      )}
    </VStack>
  );
}
