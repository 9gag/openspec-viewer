import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Heading } from "@astryxdesign/core/Heading";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
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
} from "../spec.js";
import { anchor } from "../toc.js";
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

/** Markdown and step runs, in the order the document has them. */
function Blocks({ text, components }) {
  if (!text?.trim()) return null;

  return (
    <VStack gap={0}>
      {splitSpec(text).map((block, i) =>
        block.type === "steps" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the blocks are positions in a parsed document, not a list that reorders
          <Steps key={i} steps={block.steps} />
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: same — the split is re-derived from the text on every render
          <Markdown key={i} headingLevelStart={2} components={components}>
            {block.text}
          </Markdown>
        ),
      )}
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
  const [copied, setCopied] = useState(false);

  const copy = () => {
    const { origin, pathname, hash } = window.location;
    navigator.clipboard
      ?.writeText(`${origin}${pathname}?at=${scenario.id ?? id}${hash}`)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      // A blocked clipboard is not worth an error state: the id is on screen either way.
      .catch(() => {});
  };

  return (
    <section className="scenario" id={id}>
      <HStack gap={2} align="baseline" className="scenario-head">
        <Heading level={4}>
          {scenario.id && <span className="scenario-id">{scenario.id}</span>}
          {scenario.title}
        </Heading>
        <IconButton
          icon={<Icon icon={copied ? "check" : "copy"} size="sm" />}
          size="sm"
          variant="ghost"
          label={
            copied
              ? "Link copied"
              : `Copy link to ${scenario.id ?? scenario.title}`
          }
          onClick={copy}
        />
      </HStack>
      <Blocks text={scenario.text} components={components} />
    </section>
  );
}

/** One requirement, with its scenarios behind a disclosure. */
function Requirement({ node, prefix, components, isOpen, onOpenChange }) {
  const id = anchor(prefix, node.title);
  const count = node.scenarios.length;

  return (
    <section className="requirement">
      <Heading level={3} id={id}>
        {node.title}
      </Heading>
      <Blocks text={node.text} components={components} />

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
            <Blocks key={i} text={node.text} components={components} />
          )
        ) : (
          <Requirement
            key={node.title}
            node={node}
            prefix={prefix}
            components={components}
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
