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
  SideNavHeading,
  SideNavItem,
} from "@astryxdesign/core/SideNav";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { Timestamp } from "@astryxdesign/core/Timestamp";
import { Theme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral/built";
import { useState } from "react";
import { href, POLL_MS, useApi, useRoute } from "./api.js";
import { LENSES, loadLens, saveLens } from "./lens.js";
import { loadMode, MODES, saveMode } from "./mode.js";
import { iso } from "./time.js";
import Board from "./views/Board.jsx";
import { Archive, SpecDetail, Specs } from "./views/Catalog.jsx";
import ChangeDetail from "./views/ChangeDetail.jsx";

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

function Nav({ view, arg, changes, mode, onMode }) {
  return (
    <SideNav
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
      <SideNavHeading label="Overview" />
      <SideNavItem
        href={href("board")}
        label="Board"
        isSelected={view === "board"}
      />
      <SideNavItem
        href={href("specs")}
        label="Capabilities"
        isSelected={view === "specs" || view === "spec"}
      />
      <SideNavItem
        href={href("archive")}
        label="Shipped changes"
        isSelected={view === "archive"}
      />

      <SideNavHeading label="In flight" />
      {changes.map((ch) => (
        <SideNavItem
          key={ch.id}
          href={href("change", ch.id)}
          label={ch.id}
          isSelected={view === "change" && arg === ch.id}
          endContent={
            <Text size="sm" color="secondary" hasTabularNumbers>
              {ch.done}/{ch.total}
            </Text>
          }
        />
      ))}
    </SideNav>
  );
}

export default function App() {
  const { view, arg } = useRoute();
  const [lens, setLens] = useState(loadLens);
  const [mode, setMode] = useState(loadMode);
  const { data, error, at } = useApi("/api/board");

  const chooseLens = (next) => {
    setLens(next);
    saveLens(next);
  };

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

  const { panels, defaultTab, blurb } = LENSES[lens];

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
          <HStack gap={4} align="center" justify="between" wrap="wrap">
            <StoreStatus store={data.store} />
            <VStack gap={1} hAlign="end">
              <SegmentedControl
                value={lens}
                onChange={chooseLens}
                label="Read the store as"
                size="sm"
              >
                {Object.entries(LENSES).map(([value, l]) => (
                  <SegmentedControlItem
                    key={value}
                    value={value}
                    label={l.label}
                  />
                ))}
              </SegmentedControl>
              <Text size="sm" color="secondary">
                {blurb}
              </Text>
            </VStack>
          </HStack>

          <StoreWarnings store={data.store} />

          {view === "board" && <Board board={data} panels={panels} />}
          {view === "change" && (
            <ChangeDetail id={arg} defaultTab={defaultTab} />
          )}
          {view === "specs" && <Specs />}
          {view === "spec" && <SpecDetail id={arg} />}
          {view === "archive" && <Archive />}

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
