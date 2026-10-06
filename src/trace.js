/** Trace comments sit on their own line immediately before a scenario or case heading. */
const MARKER = /^<!--\s*trace:(scenario|case)\s+id=([^\s]+)\s+rev=(\d+)(?:\s+covers=([^\s]+))?\s*-->$/;

export function parseTrace(line) {
  const match = line.trim().match(MARKER);
  if (!match) return null;
  return {
    type: "trace",
    kind: match[1],
    id: match[2],
    revision: match[3],
    covers: match[4]?.split(",").filter(Boolean) ?? [],
  };
}

export function splitTraces(text) {
  const blocks = [];
  let markdown = [];

  for (const line of text.split("\n")) {
    const marker = parseTrace(line);
    if (!marker) {
      markdown.push(line);
      continue;
    }
    if (markdown.length) blocks.push({ type: "markdown", text: markdown.join("\n") });
    markdown = [];
    blocks.push(marker);
  }

  if (markdown.length) blocks.push({ type: "markdown", text: markdown.join("\n") });
  return blocks;
}
