import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { useEffect, useState } from "react";
import { useApi } from "../api.js";
import { Artifact, FileMeta, Owner } from "../components/bits.jsx";
import { mdComponents } from "../components/markdown.jsx";
import WithOutline from "../components/WithOutline.jsx";
import { resolveTab } from "../lens.js";

/** Which of the artifacts this change's schema asks for exist, per the CLI's own reading. */
function Completeness({ completeness, id }) {
  // Hook before the early return, and a null path instead of a skipped call: an archived
  // change has no completeness to show, and navigating from one to an in-flight change
  // reuses this instance — a conditional hook would change the hook count and crash.
  // Its own request because validate --strict spawns the openspec CLI, and the artifacts
  // should not wait on it. Until it lands the badge is absent rather than optimistic.
  const { data: validation } = useApi(
    completeness ? `/api/validate?id=${encodeURIComponent(id)}` : null,
    { poll: false },
  );

  if (!completeness) return null;
  const missing = completeness.filter((a) => !a.present);

  return (
    <Card padding={4}>
      <VStack gap={3}>
        <Heading level={2}>Artifacts</Heading>
        <HStack gap={2} wrap="wrap">
          {completeness.map((a) => (
            <Badge
              key={a.name}
              variant={a.present ? "success" : "warning"}
              label={a.present ? a.name : `${a.name} missing`}
            />
          ))}
          {validation && (
            <Badge
              variant={validation.ok ? "success" : "error"}
              label={validation.ok ? "validates --strict" : "fails --strict"}
            />
          )}
        </HStack>
        {missing.length > 0 && (
          <Text size="sm" color="secondary">
            Still to write: {missing.map((a) => a.expected).join(", ")}. The
            schema declares them in dependency order, each built on the one
            before — engineering cannot start from a change with no tasks.md.
          </Text>
        )}
        {validation && !validation.ok && <CodeBlock code={validation.output} />}
      </VStack>
    </Card>
  );
}

function Capabilities({ capabilities }) {
  if (capabilities.length === 0) {
    return <Text color="secondary">This change has no spec deltas.</Text>;
  }

  return (
    <VStack gap={4}>
      {capabilities.map((cap) => (
        <Card key={cap.capability} padding={4}>
          <VStack gap={3}>
            <HStack gap={2} align="center" wrap="wrap">
              <Heading level={2}>{cap.capability}</Heading>
              {cap.kinds.map((k) => (
                <Badge
                  key={k}
                  variant={k === "MODIFIED" ? "warning" : "info"}
                  label={k}
                />
              ))}
              <Text size="sm" color="secondary">
                {cap.requirements} requirement
                {cap.requirements === 1 ? "" : "s"} · {cap.scenarios} scenario
                {cap.scenarios === 1 ? "" : "s"}
              </Text>
            </HStack>
            {cap.kinds.includes("MODIFIED") && (
              <Banner
                status="info"
                container="section"
                title="Rewrites shipped behavior"
                description="A MODIFIED block must contain the entire updated requirement, with headers matching the baseline exactly. A partial block silently drops the rest at archive time."
              />
            )}
            <Artifact
              text={cap.text}
              path={cap.path}
              bdd
              prefix={cap.capability}
            />
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

function Tasks({ groups, archived, dir }) {
  // Only an in-flight change reaches this without groups: tasks.md is the last artifact
  // written, so a change still being planned has none yet. An archived one always has it.
  if (!groups) {
    return (
      <EmptyState
        title="No tasks yet"
        description="This change has no tasks.md. Engineering cannot start from it until one exists."
        isCompact
      />
    );
  }

  // Task text is markdown the same as every other line in the file — the store writes
  // requirement names in bold and commands in backticks, and the markers are noise once
  // they are on screen. Rendered inline so the row stays one line of text: `display`
  // block would put each task in its own paragraph box.
  const md = mdComponents({ base: `${dir}/tasks.md`, inheritTextSize: true });

  return (
    <VStack gap={4}>
      {archived && (
        <Banner
          status="info"
          container="card"
          title="Frozen in the archive"
          description="This change shipped. The list is the record of what was built and who owned each group — no box will be checked here again."
        />
      )}
      {groups.map((g) => (
        <Card key={g.num} padding={4}>
          <VStack gap={2}>
            <HStack gap={2} align="center" wrap="wrap">
              <Heading level={2}>
                {g.num}. {g.title}
              </Heading>
              <Owner handle={g.owner} />
            </HStack>
            <VStack gap={1}>
              {g.tasks.map((t) => (
                // A wrapped task is one paragraph, not one line: the text column has
                // to take the leftover width and wrap inside it, or the sentence runs
                // off the card instead of down it.
                <HStack key={t.id} gap={2} align="start">
                  <Text color="secondary">{t.done ? "☑" : "☐"}</Text>
                  <Text size="sm" className="mono task-id">
                    {t.id}
                  </Text>
                  <Text
                    size="sm"
                    color={t.done ? "secondary" : "primary"}
                    hasStrikethrough={t.done}
                    className="task-text"
                  >
                    <Markdown display="inline" components={md}>
                      {t.text}
                    </Markdown>
                  </Text>
                </HStack>
              ))}
            </VStack>
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

export default function ChangeDetail({ id, defaultTab }) {
  // No polling: a proposal does not change while you read it, and re-fetching the full
  // text every 5s would re-render a document under the reader's cursor.
  const { data, error, loading } = useApi(
    `/api/change?id=${encodeURIComponent(id)}`,
    { poll: false },
  );
  const [tab, setTab] = useState(defaultTab);

  // Follow the lens when it changes, but never yank the tab out from under a click.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` is the point — a different change reopens on its lens tab rather than keeping the one you left
  useEffect(() => setTab(defaultTab), [defaultTab, id]);

  if (loading) return <Spinner label={`Reading ${id}`} />;
  if (error) {
    return (
      <Banner
        status="error"
        container="card"
        title={`Cannot read ${id}`}
        description={error}
      />
    );
  }

  // The tabs are the change's own files: the schema a change was created under decides
  // which artifacts it has, and two changes in one store can sit on different schemas.
  // The lens still says which one to open on, but only as a preference — a designer
  // opening a change with no ui.md lands on its first artifact rather than on nothing.
  const artifacts = data.artifacts;
  const active = resolveTab(artifacts, tab);
  const current = artifacts.find((a) => a.name === active);

  return (
    <VStack gap={4}>
      <VStack gap={2}>
        <HStack gap={3} align="center" wrap="wrap">
          <Heading level={1}>{data.id}</Heading>
          {data.archived && <Badge variant="neutral" label="archived" />}
        </HStack>
        <FileMeta path={data.dir} />
      </VStack>

      <Completeness completeness={data.completeness} id={data.id} />

      {artifacts.length === 0 && (
        <EmptyState
          title="Nothing written yet"
          description={`No markdown in ${data.dir}. A change starts as an empty directory and its schema says what goes in it.`}
          isCompact
        />
      )}

      <TabList value={active} onChange={setTab} hasDivider>
        {artifacts.map((a) => (
          <Tab key={a.name} value={a.name} label={a.label} />
        ))}
      </TabList>

      {/* One rail per tab body: the outline is read from the DOM, so switching tabs
          re-reads it without any wiring. Tasks has its own structure and no prose. */}
      <WithOutline>
        {current?.kind === "specs" && (
          <Capabilities capabilities={data.capabilities} />
        )}
        {current?.kind === "tasks" && (
          <Tasks groups={data.groups} archived={data.archived} dir={data.dir} />
        )}
        {current?.kind === "doc" && (
          <Card padding={4}>
            <Artifact
              text={current.text}
              commit={current.commit}
              path={current.path}
              prefix={current.name}
            />
          </Card>
        )}
      </WithOutline>
    </VStack>
  );
}
