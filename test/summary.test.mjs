/**
 * The strip's counts and the lists under them come from one function, because a tile
 * reading "2 idle claims" over a panel showing three is how a status strip stops being
 * believed. These pin the two together, and pin the filters to the counts.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  applyFilter,
  changeQueues,
  changeState,
  conflictingChanges,
  FILTERS,
  summarize,
} from "../src/summary.js";
import { QUIET_DAYS, STALE_DAYS } from "../src/time.js";

const idleFor = (days) => ({ since: 0, days, source: "claim" });

const group = (num, extra = {}) => ({
  num,
  title: `Group ${num}`,
  owner: null,
  done: 0,
  total: 4,
  open: [],
  idle: null,
  ...extra,
});

const board = (changes, extra = {}) => ({
  store: { git: true, upstream: "origin/main", behind: 0, ahead: 0, dirty: 0 },
  changes,
  conflicts: [],
  ...extra,
});

describe("summarize", () => {
  it("counts a claim as idle once it crosses the quiet threshold, not before", () => {
    const s = summarize(
      board([
        {
          id: "c",
          planning: false,
          done: 0,
          total: 8,
          groups: [
            group("1", { owner: "dana", idle: idleFor(QUIET_DAYS - 1) }),
            group("2", { owner: "ravi", idle: idleFor(STALE_DAYS) }),
          ],
        },
      ]),
    );
    assert.equal(s.idle.length, 1);
    assert.equal(s.idle[0].group.num, "2");
    assert.equal(s.idle[0].tone, "stale");
  });

  it("counts only open, ownerless groups as unclaimed", () => {
    const s = summarize(
      board([
        {
          id: "c",
          planning: false,
          done: 4,
          total: 12,
          groups: [
            group("1"), // open and ownerless
            group("2", { owner: "dana" }), // claimed
            group("3", { done: 4, total: 4 }), // finished, so not work to pick up
          ],
        },
      ]),
    );
    assert.deepEqual(
      s.unclaimed.map((u) => u.group.num),
      ["1"],
    );
  });

  it("never lists a group as both idle and unclaimed", () => {
    const s = summarize(
      board([
        {
          id: "c",
          planning: false,
          done: 0,
          total: 4,
          groups: [group("1", { owner: "dana", idle: idleFor(STALE_DAYS) })],
        },
      ]),
    );
    assert.equal(s.idle.length, 1);
    assert.equal(s.unclaimed.length, 0);
  });

  it("flags a fully checked-off change as ready to archive", () => {
    const s = summarize(
      board([
        {
          id: "done",
          planning: false,
          done: 8,
          total: 8,
          groups: [group("1", { done: 4, total: 4 })],
        },
        {
          id: "partway",
          planning: false,
          done: 4,
          total: 8,
          groups: [group("1")],
        },
      ]),
    );
    assert.deepEqual(s.ready, ["done"]);
  });

  it("does not call an empty or unplanned change ready to archive", () => {
    const s = summarize(
      board([
        { id: "planning", planning: true, done: 0, total: 0, groups: [] },
        { id: "no-tasks", planning: false, done: 0, total: 0, groups: [] },
      ]),
    );
    assert.deepEqual(s.ready, []);
  });
});

describe("summarize store state", () => {
  const state = (store) => summarize(board([], { store })).store;

  it("reports being behind as the loudest problem, since the whole page is read from here", () => {
    assert.equal(
      state({
        git: true,
        upstream: "origin/main",
        behind: 3,
        ahead: 1,
        dirty: 2,
      }).tone,
      "error",
    );
    assert.match(
      state({ git: true, upstream: "origin/main", behind: 3 }).label,
      /3 behind/,
    );
  });

  it("warns about uncommitted and unpushed work without calling it an error", () => {
    assert.equal(
      state({ git: true, upstream: "origin/main", behind: 0, dirty: 2 }).tone,
      "warning",
    );
    assert.equal(
      state({
        git: true,
        upstream: "origin/main",
        behind: 0,
        ahead: 1,
        dirty: 0,
      }).tone,
      "warning",
    );
  });

  it("is ok when clean, and says so differently with no upstream", () => {
    assert.equal(
      state({
        git: true,
        upstream: "origin/main",
        behind: 0,
        ahead: 0,
        dirty: 0,
      }).tone,
      "ok",
    );
    assert.equal(
      state({ git: true, upstream: null, behind: 0, ahead: 0, dirty: 0 }).label,
      "no upstream",
    );
  });

  it("treats a store that is not a git repo as an error", () => {
    assert.equal(state({ git: false }).tone, "error");
  });
});

describe("applyFilter", () => {
  const changes = [
    {
      id: "guest",
      planning: false,
      done: 4,
      total: 12,
      groups: [
        group("1", { owner: "ravi", done: 4, total: 4 }),
        group("2"),
        group("3", { owner: "dana", idle: idleFor(STALE_DAYS) }),
      ],
    },
    {
      id: "alerts",
      planning: false,
      done: 4,
      total: 4,
      groups: [group("1", { done: 4, total: 4 })],
    },
  ];
  const s = summarize(
    board(changes, {
      conflicts: [
        { capability: "cart", changes: [{ change: "guest" }], modifies: [] },
      ],
    }),
  );

  it("returns everything when nothing is selected", () => {
    assert.equal(applyFilter(changes, null, s), changes);
  });

  it("narrows to the matching groups, not just the matching changes", () => {
    const out = applyFilter(changes, "idle", s);
    assert.deepEqual(
      out.map((c) => c.id),
      ["guest"],
    );
    assert.deepEqual(
      out[0].groups.map((g) => g.num),
      ["3"],
    );
  });

  it("narrows unclaimed to the open ownerless group", () => {
    const out = applyFilter(changes, "unclaimed", s);
    assert.deepEqual(
      out[0].groups.map((g) => g.num),
      ["2"],
    );
  });

  it("keeps whole changes for change-level filters", () => {
    const ready = applyFilter(changes, "ready", s);
    assert.deepEqual(
      ready.map((c) => c.id),
      ["alerts"],
    );
    assert.equal(ready[0].groups.length, 1);

    const conflicting = applyFilter(changes, "conflicts", s);
    assert.deepEqual(
      conflicting.map((c) => c.id),
      ["guest"],
    );
    assert.equal(
      conflicting[0].groups.length,
      3,
      "a conflict is about the change, not one group",
    );
  });

  it("does not mutate the board it filters", () => {
    applyFilter(changes, "idle", s);
    assert.equal(changes[0].groups.length, 3);
  });

  it("keeps exactly the changes the simplified board badges", () => {
    const ids = conflictingChanges(s.conflicts);
    assert.deepEqual(
      applyFilter(changes, "conflicts", s).map((c) => c.id),
      changes.filter((c) => ids.has(c.id)).map((c) => c.id),
    );
  });
});

/**
 * The simplified board badges these rows and the tile filters the full board to them.
 * Two readings, one set: a change the full board calls dangerous to archive and the
 * simplified board shows as an ordinary row is the same drift the counts avoid.
 */
describe("conflictingChanges", () => {
  it("is empty when nothing collides", () => {
    assert.equal(conflictingChanges([]).size, 0);
  });

  it("names every change on both sides of a conflict", () => {
    const ids = conflictingChanges([
      {
        capability: "cart",
        changes: [{ change: "guest" }, { change: "limits" }],
        modifies: [],
      },
    ]);
    assert.deepEqual([...ids].sort(), ["guest", "limits"]);
  });

  it("counts a change once when it collides on two capabilities", () => {
    const ids = conflictingChanges([
      { capability: "cart", changes: [{ change: "guest" }], modifies: [] },
      { capability: "pricing", changes: [{ change: "guest" }], modifies: [] },
    ]);
    assert.deepEqual([...ids], ["guest"]);
  });
});

/**
 * The chips over the simplified board. They are queues, not one state per change, and the
 * case that matters is the change that is in two of them: finished and in a conflict is
 * the change about to be archived into the hazard, and a chip that filed it under one of
 * those would disagree with the banner naming it under the other.
 */
describe("changeQueues", () => {
  const finished = {
    id: "done",
    planning: false,
    done: 4,
    total: 4,
    groups: [],
  };
  const started = {
    id: "half",
    planning: false,
    done: 2,
    total: 4,
    groups: [],
  };
  const fresh = { id: "new", planning: false, done: 0, total: 4, groups: [] };
  const planned = {
    id: "planned",
    planning: true,
    done: 0,
    total: 0,
    groups: [],
  };
  const all = [finished, started, fresh, planned];

  const queues = (conflicts = []) =>
    changeQueues(summarize(board(all, { conflicts })));

  const keysFor = (change, conflicts = []) =>
    queues(conflicts)
      .filter((q) => q.has(change))
      .map((q) => q.key);

  it("puts each ordinary change in exactly one queue", () => {
    assert.deepEqual(keysFor(finished), ["ready"]);
    assert.deepEqual(keysFor(started), ["moving"]);
    assert.deepEqual(keysFor(fresh), ["unstarted"]);
  });

  it("puts a finished change that is also in a conflict in both", () => {
    const conflicts = [
      { capability: "cart", changes: [{ change: "done" }], modifies: [] },
    ];
    assert.deepEqual(keysFor(finished, conflicts), ["ready", "conflicts"]);
  });

  it("leaves a change still being planned out of all of them", () => {
    assert.deepEqual(keysFor(planned), []);
  });

  it("counts ready the way the strip counts it", () => {
    const s = summarize(board(all));
    const ready = changeQueues(s).find((q) => q.key === "ready");
    assert.deepEqual(
      all.filter(ready.has).map((c) => c.id),
      s.ready,
    );
  });
});

describe("filter wiring", () => {
  const strip = readFileSync(
    join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "src",
      "components",
      "StatusStrip.jsx",
    ),
    "utf8",
  );
  const offered = [...strip.matchAll(/filter="([^"]+)"/g)].map((m) => m[1]);

  it("offers exactly the filters the strip has tiles for", () => {
    // A tile whose name applyFilter does not handle silently narrows the board to
    // nothing, which reads as "no work of that kind" rather than as a bug.
    assert.deepEqual([...offered].sort(), [...FILTERS].sort());
  });

  it("handles every declared filter without emptying a board that has matches", () => {
    const changes = [
      {
        id: "c",
        planning: false,
        done: 4,
        total: 4,
        groups: [
          group("1", { done: 4, total: 4 }),
          group("2"),
          group("3", { owner: "dana", idle: idleFor(STALE_DAYS) }),
        ],
      },
    ];
    const s = summarize(
      board(changes, {
        conflicts: [
          { capability: "cart", changes: [{ change: "c" }], modifies: [] },
        ],
      }),
    );
    for (const f of FILTERS) {
      assert.ok(
        applyFilter(changes, f, s).length > 0,
        `filter '${f}' matched nothing on a board that has some`,
      );
    }
  });
});

/**
 * The nav's dot. One dot per change, so it can only say one thing — these pin which
 * thing, and pin it to the order the strip reads its tiles in.
 */
describe("changeState", () => {
  const change = (extra = {}) => ({
    id: "c",
    planning: false,
    done: 0,
    total: 8,
    groups: [],
    ...extra,
  });

  it("says planning for a change with no tasks to have a state about", () => {
    assert.deepEqual(changeState(change({ planning: true, total: 0 })), {
      variant: "neutral",
      label: "planning",
    });
  });

  it("puts a stale claim above everything, including work that is finished", () => {
    const state = changeState(
      change({
        done: 8,
        groups: [
          group("1", {
            owner: "dana",
            done: 8,
            total: 8,
            idle: idleFor(STALE_DAYS),
          }),
        ],
      }),
    );
    assert.deepEqual(state, { variant: "error", label: "idle claim" });
  });

  it("separates a claim that has gone quiet from one that has gone stale", () => {
    const state = changeState(
      change({
        groups: [group("1", { owner: "dana", idle: idleFor(QUIET_DAYS) })],
      }),
    );
    assert.deepEqual(state, { variant: "warning", label: "idle claim" });
  });

  it("reports ready to archive only when every task is checked off", () => {
    const groups = [group("1", { owner: "dana", done: 4, total: 4 })];
    assert.equal(
      changeState(change({ done: 4, total: 4, groups })).label,
      "ready to archive",
    );
    assert.equal(
      changeState(change({ done: 3, total: 4, groups })).label,
      "in progress",
    );
  });

  it("reports unclaimed work ahead of progress, the way the strip ranks them", () => {
    const state = changeState(
      change({
        done: 2,
        groups: [group("1", { owner: "dana", done: 2, total: 4 }), group("2")],
      }),
    );
    assert.deepEqual(state, { variant: "warning", label: "unclaimed work" });
  });

  it("is quiet for a change that is claimed and moving", () => {
    assert.deepEqual(
      changeState(
        change({
          done: 2,
          groups: [
            group("1", { owner: "dana", done: 2, total: 8, idle: idleFor(0) }),
          ],
        }),
      ),
      { variant: "accent", label: "in progress" },
    );
  });

  it("is neutral for a change nobody has started", () => {
    assert.deepEqual(
      changeState(change({ groups: [group("1", { owner: "dana" })] })),
      {
        variant: "neutral",
        label: "not started",
      },
    );
  });
});
