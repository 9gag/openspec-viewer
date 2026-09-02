import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { Text } from "@astryxdesign/core/Text";
import { useTheme } from "@astryxdesign/core/theme";
import { useEffect, useId, useState } from "react";

/**
 * Every diagram type that offers the choice draws at its natural size rather than
 * shrinking to the column it sits in. A wide diagram is wide because it has a lot in it,
 * and scaling an eight-table ER diagram down to a prose column is how its labels stop
 * being readable — the box around it scrolls instead. Types that do not take the option
 * ignore it.
 */
const NATURAL_SIZE = Object.fromEntries(
  [
    "flowchart",
    "er",
    "sequence",
    "class",
    "state",
    "gantt",
    "journey",
    "requirement",
    "timeline",
    "gitGraph",
    "c4",
    "mindmap",
    "quadrantChart",
    "xyChart",
    "sankey",
    "block",
    "packet",
    "architecture",
  ].map((type) => [type, { useMaxWidth: false }]),
);

/**
 * A ```mermaid block, drawn.
 *
 * Design docs in an OpenSpec store carry flowcharts and ER diagrams, and a store's rules
 * ask for them by name — "include an ER diagram for the relevant relationships". Rendered
 * as a code fence they were the one thing on the page a reader had to compile in their
 * head, which is the opposite of what a diagram is for.
 *
 * Mermaid is imported dynamically and never lands in the initial bundle: it is several
 * times the size of this whole app, it loads its diagram types on demand, and most
 * documents have no diagram in them. A reader who never opens one never fetches it.
 *
 * The source stays on screen until the picture is ready and comes back if it never is, so
 * a diagram that does not parse costs the reader nothing — the fence is still there to
 * read, with the parser's complaint under it. Same for a browser that cannot run the
 * import at all.
 */
export default function Diagram({ code }) {
  // Astryx resolves 'system' against the OS for us, and re-renders when either the
  // setting or the OS changes — so this is also what re-draws the diagram in the other
  // mode. Mermaid bakes its colours into the SVG; there is no restyling it after the fact.
  const { mode } = useTheme();
  const [drawn, setDrawn] = useState({ svg: null, error: null });

  // Mermaid puts this in the DOM as an element id while it measures the diagram, so it
  // has to be unique per block and safe as a CSS selector.
  const id = `diagram-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          // The store's markdown is the input, and a spec is a document anyone on the
          // team can edit — so no click handlers, no inline scripts, no foreignObject
          // HTML. Strict renders the labels as SVG text and nothing else.
          securityLevel: "strict",
          theme: mode === "dark" ? "dark" : "default",
          // Inherited from the page rather than mermaid's own stack, so a diagram's
          // labels read as part of the document they sit in.
          fontFamily: "inherit",
          ...NATURAL_SIZE,
        });
        const { svg } = await mermaid.render(id, code);
        if (live) setDrawn({ svg, error: null });
      } catch (err) {
        if (live) setDrawn({ svg: null, error: err?.message ?? String(err) });
      }
    })();

    return () => {
      live = false;
    };
  }, [code, id, mode]);

  if (drawn.svg)
    return (
      <div className="diagram">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: mermaid renders to an SVG string, sanitised by securityLevel: strict */}
        <figure dangerouslySetInnerHTML={{ __html: drawn.svg }} />
      </div>
    );

  return (
    <div className="diagram-source">
      <CodeBlock code={code} language="mermaid" isCollapsible />
      {drawn.error && (
        <Text size="sm" color="secondary">
          This diagram did not parse: {drawn.error}
        </Text>
      )}
    </div>
  );
}
