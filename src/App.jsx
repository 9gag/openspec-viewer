import { AppShell } from "@astryxdesign/core/AppShell";
import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import {
  SegmentedControl,
  SegmentedControlItem,
} from "@astryxdesign/core/SegmentedControl";
import {
  SideNav,
  SideNavItem,
  SideNavSection,
} from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { TreeList } from "@astryxdesign/core/TreeList";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { useState } from "react";
import { href, POLL_MS, useApi, useRoute } from "./api.js";
import { changeTreeByNamespace } from "./capabilities.js";
import { loadMode, MODES, saveMode } from "./mode.js";
import { changeState } from "./summary.js";
import { iso } from "./time.js";
import Board from "./views/Board.jsx";
import { Archive, SpecDetail, Specs } from "./views/Catalog.jsx";
import ChangeDetail from "./views/ChangeDetail.jsx";
import DocDetail from "./views/Doc.jsx";

/** Sync state of the store clone, which everything else on the page is read from. */
function StoreStatus({ store }) {
  const bits = [];
  if (store.branch) bits.push(`branch ${store.branch}`);
  if (store.dirty) bits.push(`${store.dirty} uncommitted file(s)`);
  if (store.upstream) {
    if (store.behind) bits.push(`${store.behind} behind ${store.upstream}`);
    if (store.ahead) bits.push(`${store.ahead} unpushed`);
    if (!store.behind && !store.ahead)
      bits.push(`up to date with ${store.upstream}`);
  } else if (store.git) {
    bits.push("no upstream configured");
  }

  return (
    <VStack gap={1}>
      <HStack gap={2} align="center" wrap="wrap">
        <Text weight="semibold">{store.id ?? "(local)"}</Text>
        <Text size="sm" color="secondary" className="mono">
          {store.path}
        </Text>
      </HStack>
      <Text size="sm" color="secondary">
        {bits.join(" · ")}
      </Text>
    </VStack>
  );
}

/**
 * Warnings about the clone itself, not about the plans.
 *
 * They come first because everything below is read from this working copy: a board built
 * from a stale clone is confidently wrong, which is worse than a board that is missing.
 */
function StoreWarnings({ store }) {
  return (
    <VStack gap={2}>
      {!store.git && (
        <Banner
          status="warning"
          container="card"
          title="The store is not a git repository"
          description="Plans cannot be shared, and with no history there are no idle times."
        />
      )}
      {store.behind > 0 && (
        <Banner
          status="warning"
          container="card"
          title={`This clone is ${store.behind} commit(s) behind ${store.upstream}`}
          description={`Everything below may already be out of date. Run ${store.cli} sync.`}
        />
      )}
      {store.dirty > 0 && (
        <Banner
          status="info"
          container="card"
          title={`${store.dirty} uncommitted file(s) in the store`}
          description="Checkmarks nobody pushed are invisible to the team — the store is the only notification channel."
        />
      )}
    </VStack>
  );
}

/**
 * The namespace tree as TreeList data.
 *
 * Recursive because the tree is: `storefront/checkout` is two levels wherever the store
 * puts a third, and TreeList draws the guide lines and the indent from the nesting it is
 * handed. A namespace's own changes come before the namespaces inside it — they belong to
 * the row above them, and pushing them under an expanded subtree would separate them
 * from it.
 *
 * Expanded by default at every level: a nav that opens closed makes a reader click to
 * find out whether there was anything to click for. What they collapse stays collapsed —
 * TreeList keeps its own overrides over this data.
 */
function treeItem(node, view, arg) {
  return {
    id: node.path,
    label: node.name,
    isExpanded: true,
    // Every change beneath this namespace, not the rows immediately under it, so a
    // collapsed branch still says how much is in there.
    endContent: (
      <Text size="sm" color="secondary" hasTabularNumbers>
        {node.count}
      </Text>
    ),
    children: [
      ...node.changes.map((change) => changeItem(node, change, view, arg)),
      ...node.children.map((child) => treeItem(child, view, arg)),
    ],
  };
}

/**
 * One change in the nav: where to find it, how far along it is, and the one thing about
 * it that might need a person — see `changeState`. The dot is the only thing in this
 * column that reports rather than links.
 *
 * The id carries the namespace because a change that deltas two of them is a row under
 * each, and TreeList tracks a row by its id.
 */
function changeItem(node, change, view, arg) {
  const state = changeState(change);

  return {
    id: `${node.path}/${change.id}`,
    label: change.id,
    href: href("change", change.id),
    isSelected: view === "change" && arg === change.id,
    endContent: (
      <HStack gap={2} align="center">
        <Text size="sm" color="secondary" hasTabularNumbers>
          {change.done}/{change.total}
        </Text>
        <StatusDot
          variant={state.variant}
          label={state.label}
          tooltip={state.label}
        />
      </HStack>
    ),
  };
}

function Nav({ view, arg, changes, mode, onMode }) {
  return (
    <SideNav
      // Wide enough for the tree it holds: a change id under three levels of namespace
      // wrapped to three lines at the default 260, and a nav that wraps is a nav you read
      // rather than scan. Draggable from there because how much of it you want is a
      // property of your screen and what you are doing, and remembered per browser for
      // the same reason the appearance is.
      resizable={{
        defaultWidth: 340,
        minWidth: 240,
        maxWidth: 620,
        autoSaveId: "openspec-viewer.nav-width",
      }}
      footer={
        <VStack gap={1} padding={3}>
          <SegmentedControl
            value={mode}
            onChange={onMode}
            label="Appearance"
            size="sm"
            layout="fill"
          >
            {MODES.map((m) => (
              <SegmentedControlItem
                key={m.value}
                value={m.value}
                label={m.label}
              />
            ))}
          </SegmentedControl>
        </VStack>
      }
      header={
        <VStack gap={1} padding={3}>
          <Heading level={1}>Plan board</Heading>
          <Badge variant="neutral" label="read-only" />
        </VStack>
      }
    >
      <SideNavSection title="Overview" className="nav-section">
        <SideNavItem
          href={href("board")}
          label="Board"
          isSelected={view === "board"}
        />
        <SideNavItem
          href={href("specs")}
          label="Production"
          isSelected={view === "specs" || view === "spec"}
        />
        <SideNavItem
          href={href("archive")}
          label="Shipped changes"
          isSelected={view === "archive"}
        />
      </SideNavSection>

      {/* One section over the whole namespace tree, because "in flight" is what every
          branch of it has in common. Each namespace is an item that collapses over what
          is inside it, so a product nobody is working in today folds away in one click
          and the disclosure is what says the level is there at all. */}
      <SideNavSection title="In flight" className="nav-section">
        <TreeList
          density="compact"
          items={changeTreeByNamespace(changes).map((node) =>
            treeItem(node, view, arg),
          )}
        />
      </SideNavSection>
    </SideNav>
  );
}

export default function App() {
  const { view, arg } = useRoute();
  const [mode, setMode] = useState(loadMode);
  // Polled only while the board is the view being read. The nav needs this data
  // everywhere, so it is still fetched on every view — but the store is read by shelling
  // out to git, and a poll landing every 5s behind a spec the reader just clicked makes
  // that spec wait for a board nobody is looking at. Coming back to the board reloads it.
  const { data, error, at } = useApi("/api/board", { poll: view === "board" });

  const chooseMode = (next) => {
    setMode(next);
    saveMode(next);
  };

  // Everything renders inside <Theme>: it applies the root class the design tokens hang
  // off, so anything outside it — including this loading state — falls back to unstyled
  // browser defaults.
  if (!data) {
    return (
      <Theme theme={neutralTheme} mode={mode}>
        <VStack gap={3} padding={6}>
          {error ? (
            <Banner
              status="error"
              container="card"
              title="Cannot read the store"
              description={
                <VStack gap={2}>
                  <Text size="sm">{error}</Text>
                  <Text size="sm" color="secondary">
                    The store: id in openspec/config.yaml resolves through the
                    per-machine registry. If it is not registered here, run
                    openspec store register &lt;path&gt;.
                  </Text>
                </VStack>
              }
            />
          ) : (
            <Spinner label="Reading the store" />
          )}
        </VStack>
      </Theme>
    );
  }

  return (
    <Theme theme={neutralTheme} mode={mode}>
      <AppShell
        height="fill"
        contentPadding={5}
        sideNav={
          <Nav
            view={view}
            arg={arg}
            changes={data.changes}
            mode={mode}
            onMode={chooseMode}
          />
        }
        banner={
          error ? (
            <Banner
              status="warning"
              title="Refresh failed"
              description={`${error} — showing the board read at ${new Date(at).toLocaleTimeString()}.`}
            />
          ) : undefined
        }
      >
        <VStack gap={4}>
          <StoreStatus store={data.store} />

          <StoreWarnings store={data.store} />

          {view === "board" && <Board board={data} />}
          {view === "change" && <ChangeDetail id={arg} />}
          {view === "specs" && <Specs />}
          {view === "spec" && <SpecDetail id={arg} />}
          {view === "archive" && <Archive />}
          {/* No nav entry: a store document is reached by following a link out of an
              artifact, never from a list. */}
          {view === "doc" && <DocDetail id={arg} />}

          <HStack gap={2} align="center" wrap="wrap">
            <Text size="sm" color="secondary">
              Read from disk
            </Text>
            {/* The client's fetch time, not the server's read time: the two clocks differ by
              enough that generatedAt rendered as "in a few seconds". */}
            <Timestamp
              value={iso(at)}
              format="relative"
              size="sm"
              color="secondary"
              isLive
            />
            <Text size="sm" color="secondary">
              · polling every {POLL_MS / 1000}s · claims and checkmarks are git
              commits, and this page only reads them.
            </Text>
          </HStack>
        </VStack>
      </AppShell>
    </Theme>
  );
}
