import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Card } from "@astryxdesign/core/Card";
import { Collapsible, CollapsibleGroup } from "@astryxdesign/core/Collapsible";
import { CodeBlock } from "@astryxdesign/core/CodeBlock";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { Markdown } from "@astryxdesign/core/Markdown";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Tab, TabList } from "@astryxdesign/core/TabList";
import { Text } from "@astryxdesign/core/Text";
import { Fragment, useEffect, useState } from "react";
import { useApi } from "../api.js";
import { namespaceOf } from "../capabilities.js";
import { NamespacePaths } from "../components/NamespacePath.jsx";
import { Artifact, FileMeta, LensControl, Owner } from "../components/bits.jsx";
import { mdComponents } from "../components/markdown.jsx";
import References, { ReferenceBadge } from "../components/References.jsx";
import { ResolvedIds } from "../components/ScenarioRef.jsx";
import WithOutline from "../components/WithOutline.jsx";
import { linkedScenario, loadLens, saveLens } from "../spec.js";
import { changeTabs, resolveTab } from "../tabs.js";

/** Which of the artifacts this change's schema asks for exist, per the CLI's own reading. */
function Completeness({ completeness, id, references }) {
  // Hook before the early return, and a null path instead of a skipped call: an archived
  // change has no completeness to show, and navigating from one to an in-development change
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
          {/* `expected`, which is the filename the schema asks for — the completeness
              entries carry `name`, `expected` and `present`, and never the `label` the
              tabs are built from, so every one of these badges rendered empty and a
              missing artifact announced itself as "undefined missing". The filename is
              also the more useful of the two here: this card is read when something is
              absent, and the answer to "what is missing" is a file to go and write. */}
          {completeness.map((a) => (
            <Badge
              key={a.name}
              variant={a.present ? "success" : "warning"}
              label={a.present ? a.expected : `${a.expected} missing`}
            />
          ))}
          {validation && (
            <Badge
              variant={validation.ok ? "success" : "error"}
              label={validation.ok ? "validates --strict" : "fails --strict"}
            />
          )}
          {/* Beside the CLI's own verdict, because it is the same kind of answer and the
              CLI does not give this one: `validate --strict` checks the shape of a
              change, not whether the ids inside it name anything. */}
          <ReferenceBadge references={references} />
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
  // One control over every capability the change deltas: "show me the requirements" is
  // not a question a reader asks per capability.
  const [lens, setLens] = useState(loadLens);
  const chooseLens = (next) => {
    setLens(next);
    saveLens(next);
  };
  // Which capability is open, held here rather than by the group, because the panel's
  // contents depend on it — see below.
  const [open, setOpen] = useState(null);

  if (capabilities.length === 0) {
    return <Text color="secondary">This change has no spec deltas.</Text>;
  }

  const control = (
    <HStack hAlign="end">
      <LensControl value={lens} onChange={chooseLens} />
    </HStack>
  );

  // A change deltaing one capability has nothing to fold: a disclosure around the only
  // thing on the tab is a click between the reader and what they came for.
  if (capabilities.length === 1) {
    return (
      <VStack gap={4}>
        {control}
        <Card padding={4}>
          <VStack gap={3}>
            <DeltaHeading cap={capabilities[0]} />
            <Delta cap={capabilities[0]} lens={lens} />
          </VStack>
        </Card>
      </VStack>
    );
  }

  /*
   * More than one, and they fold.
   *
   * Two deltas on a change here run to twenty-four thousand characters — sixteen
   * requirements over forty-nine scenarios — and stacked end to end the second one begins
   * below anything a reader is going to scroll to. Which capabilities a change touches is
   * itself the answer to a question, and closed they are exactly that list: the name,
   * whether it rewrites shipped behavior, and how big it is.
   *
   * All closed to start, and one open at a time after that. Opening the first for the
   * reader picks a capability on their behalf, and there is no reason it should be the
   * one the store happens to sort first; closed, the tab opens as the list of what this
   * change touches, which is a question in its own right and the one a reader arriving
   * here asks before "what does it say". Nothing is lost by it: every heading carries its
   * own summary, so which one to open is decided without opening any of them.
   *
   * A closed panel renders nothing, rather than being handed its spec and hidden. Astryx
   * closes a Collapsible by animating its height to zero with the content still mounted,
   * and the outline rail is read from the DOM: left to itself it listed every requirement
   * of every capability while the page showed none of them, and each entry scrolled to an
   * anchor inside a collapsed box. That is the rule the lens already follows for its own
   * scenarios, for the same reason — the rail cannot be allowed to offer a heading that
   * is not on the page.
   */
  return (
    <VStack gap={4}>
      {control}
      <CollapsibleGroup
        type="single"
        value={open ?? ""}
        onChange={(next) =>
          setOpen((Array.isArray(next) ? next[0] : next) || null)
        }
      >
        <VStack gap={3}>
          {capabilities.map((cap) => (
            <Card key={cap.capability} padding={4}>
              <Collapsible
                value={cap.capability}
                trigger={<DeltaHeading cap={cap} />}
              >
                {open === cap.capability && (
                  <VStack paddingBlock={3}>
                    <Delta cap={cap} lens={lens} />
                  </VStack>
                )}
              </Collapsible>
            </Card>
          ))}
        </VStack>
      </CollapsibleGroup>
    </VStack>
  );
}

/**
 * What a capability says before it is opened: its name, what this change does to it, and
 * how much of it there is. Enough to choose one without opening any.
 */
function DeltaHeading({ cap }) {
  return (
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
        {cap.requirements} requirement{cap.requirements === 1 ? "" : "s"} ·{" "}
        {cap.scenarios} scenario{cap.scenarios === 1 ? "" : "s"}
      </Text>
    </HStack>
  );
}

/**
 * One capability's delta: the warning it has earned, and the spec itself.
 *
 * The banner used to be on every MODIFIED delta, saying that a block whose headers do not
 * match the baseline drops the rest of the requirement at archive time. True, and unread by
 * the second one — a warning that appears whether or not anything is wrong is decoration.
 * The same sentence is now the answer to a check, so it appears only when the fold really
 * would land wrong, and names the requirement it would land wrong on.
 */
function Delta({ cap, lens }) {
  return (
    <VStack gap={3}>
      {cap.drift?.reason === "drift" && (
        <Banner
          status="error"
          container="section"
          title={`${cap.drift.requirements.length} MODIFIED requirement${cap.drift.requirements.length === 1 ? "" : "s"} no longer match the baseline`}
          description={`Archiving matches a MODIFIED block to the baseline by its "### Requirement:" line, word for word. ${cap.drift.requirements.map((r) => `"${r}"`).join(", ")} ${cap.drift.requirements.length === 1 ? "is not" : "are not"} in the shipped spec, so the fold will leave the requirement as it stands and drop this rewrite silently.`}
        />
      )}
      {cap.drift?.reason === "no-baseline" && (
        <Banner
          status="warning"
          container="section"
          title="Rewrites a capability that has never shipped"
          description="There is no baseline spec for this capability, so a MODIFIED block has nothing to fold into. Either these requirements are new and belong under ADDED, or the capability path is not the one that holds them."
        />
      )}
      <Artifact
        text={cap.text}
        path={cap.path}
        bdd
        prefix={cap.capability}
        lens={lens}
      />
    </VStack>
  );
}

/**
 * Every capability's copy of one document, stacked.
 *
 * Not folded the way the deltas are: these are the second reading of a capability rather
 * than the first, so a reader who opened the tab is already narrower than one arriving at
 * the change — and the heading naming which capability each belongs to only earns its
 * place when there is more than one to tell apart.
 */
function CapabilityDocs({ docs }) {
  return (
    <VStack gap={4}>
      {docs.map((doc) => (
        <Card key={doc.path} padding={4}>
          <VStack gap={3}>
            {docs.length > 1 && <Heading level={2}>{doc.capability}</Heading>}
            <Artifact
              text={doc.text}
              path={doc.path}
              commit={doc.commit}
              prefix={doc.capability}
            />
          </VStack>
        </Card>
      ))}
    </VStack>
  );
}

function Tasks({ groups, archived, dir }) {
  // Only an in-development change reaches this without groups: tasks.md is the last artifact
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

/**
 * Where this change is filed, above its name.
 *
 * The line under the title is the change's own directory — `openspec/changes/<id>`, which
 * is the same shape for every change in the store and so says nothing about this one. The
 * namespace is the part that does: it is the band the board files the change under and
 * the branch the nav opens to reach it, and arriving here from a link or a bookmark left
 * you with an id and no idea which application it belonged to.
 *
 * Read off the capabilities the change deltas rather than stored anywhere, because that is
 * where the grouping comes from everywhere else — one source, so a change cannot sit
 * under one namespace on the board and claim another here.
 *
 * The whole path, not the leaf: two applications can hold an area of the same name, and
 * the leaf alone would be the one thing this line exists to disambiguate.
 *
 * Set like the change id below it rather than as a quiet caption, so the two lines read as
 * one title: where the change is filed, then what it is called. That also keeps it out of
 * the monospace the paths use, which is the right voice for `openspec/changes/<id>` — a
 * location on disk you copy — and the wrong one for a namespace, which is a place in the
 * plan and is spoken out loud in a standup.
 */
function Namespaces({ capabilities }) {
  const spaces = [
    ...new Set(
      capabilities.map((c) => namespaceOf(c.capability)).filter(Boolean),
    ),
  ];

  if (spaces.length === 0) return null;

  return (
    <div className="ns-line change-namespace">
      <NamespacePaths paths={spaces} />
    </div>
  );
}

/**
 * The tab a `?at=` link should open on, or null when nothing was asked for.
 *
 * Only the deltas define scenarios, and only one tab renders them, so this is that tab
 * whenever one of this change's capabilities carries the id. A link naming a scenario the
 * change does not define opens nothing in particular, which is the same answer as a reader
 * arriving with no link at all.
 */
function tabHolding(data, tabs) {
  const asked = linkedScenario();
  if (!asked) return null;

  const holds = data.capabilities.some((cap) =>
    new RegExp(String.raw`^####\s+Scenario:\s*${asked}\b`, "im").test(
      cap.text ?? "",
    ),
  );

  return holds ? (tabs.find((t) => t.kind === "specs")?.name ?? null) : null;
}

export default function ChangeDetail({ id }) {
  // No polling: a proposal does not change while you read it, and re-fetching the full
  // text every 5s would re-render a document under the reader's cursor.
  const { data, error, loading } = useApi(
    `/api/change?id=${encodeURIComponent(id)}`,
    { poll: false },
  );
  const [tab, setTab] = useState(null);

  // Every change opens on its own first artifact rather than on the tab you left, which
  // may not be a tab this one has.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `id` is the whole dependency — the tab it resets is deliberately not one
  useEffect(() => setTab(null), [id]);

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
  // Then whatever the spec directories hold besides their specs, which no schema declares
  // and which the page would otherwise never open — after the artifacts, because the
  // change is read through the files it was written as.
  const artifacts = data.artifacts;
  const tabs = changeTabs(artifacts, data.capabilities);
  // A link that names a scenario opens the tab holding it. Without this, following a
  // citation from a task list landed on the change's first artifact — its proposal — with
  // the scenario asked for on a tab the reader still had to find, which is most of the
  // work the link was supposed to save.
  const active = resolveTab(tabs, tab ?? tabHolding(data, tabs));
  const current = tabs.find((a) => a.name === active);

  return (
    <ResolvedIds value={data.references?.resolved}>
      <VStack gap={4} className="doc-page">
        <VStack gap={2}>
          <Namespaces capabilities={data.capabilities} />
          <HStack gap={3} align="center" wrap="wrap">
            <Heading level={1}>{data.id}</Heading>
            {data.archived && <Badge variant="neutral" label="archived" />}
          </HStack>
          <FileMeta path={data.dir} />
        </VStack>

        <Completeness
          completeness={data.completeness}
          id={data.id}
          references={data.references}
        />

        {/* Above the tabs: an id that names nothing is a fact about the change rather than
          about the artifact you happen to have open, and the file it is in is named on
          the row. */}
        <References references={data.references} />

        {artifacts.length === 0 && (
          <EmptyState
            title="Nothing written yet"
            description={`No markdown in ${data.dir}. A change starts as an empty directory and its schema says what goes in it.`}
            isCompact
          />
        )}

        <TabList value={active} onChange={setTab} hasDivider>
          {tabs.map((a) => (
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
            <Tasks
              groups={data.groups}
              archived={data.archived}
              dir={data.dir}
            />
          )}
          {current?.kind === "capability-doc" && (
            <CapabilityDocs docs={current.docs} />
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
    </ResolvedIds>
  );
}
