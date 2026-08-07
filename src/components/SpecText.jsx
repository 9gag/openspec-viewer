import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Text } from "@astryxdesign/core/Text";
import { splitSpec } from "../bdd.js";
import { mdComponents } from "./markdown.jsx";

/**
 * A spec, rendered so the load-bearing words are visible.
 *
 * Astryx's Markdown lets you override the paragraph, heading, code and link renderers,
 * but not lists — and OpenSpec writes every scenario step as a list item
 * (`- **WHEN** …`), which is exactly where the keywords live. So the step runs are pulled
 * out and rendered here, and everything else still goes through Markdown untouched.
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

export default function SpecText({ text, prefix = "" }) {
  const components = mdComponents({ prefix, bdd: true });
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
