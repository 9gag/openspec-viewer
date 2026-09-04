---
name: review-changes
description: Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes — Standards (does the code follow this repo's documented conventions?) and Spec (does the code match what the OpenSpec change asked for?). Runs both reviews in parallel sub-agents and reports them side by side. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to "review since X".
---

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards** — does the code conform to this repo's documented conventions?
- **Spec** — does the code faithfully implement the OpenSpec change it came from?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point — a commit SHA, branch name, tag, `main`, `HEAD~5`. This repo works on `main`, so with nothing said, default to the last release tag (`git describe --tags --abbrev=0`) and say so; on a feature branch, default to `main`.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff fails here — not inside two parallel sub-agents.

### 2. Identify the spec source

This repo is an OpenSpec store of its own, so the planning store is the first place to look, not the last. Take these in order:

1. **An OpenSpec change.** `openspec list --json` names every change in flight. Match on the commits or on what the user said; when more than one could match, name the candidates and let the user pick. The viewer itself is the fastest way to read one — `pnpm dev` in this directory shows this repo's own board.
   - `openspec instructions apply --change <id> --json` names the proposal, the spec deltas, the design, and the tasks. Read all of them.
   - **The spec deltas are the acceptance criteria.** Every scenario is a named, checkable unit, and the config's own rule is that a scenario is written so a `node:test` case can check it — so a scenario with no test naming it is a finding.
   - **`design.md` decisions are binding.** A departure from one is a finding, not a judgement call; departing is the change owner's decision, not the implementer's.
   - **Scope to the task group, not the change.** `tasks.md` is groups of numbered tasks, each ending in a verify step, and implementation stops at group boundaries. Establish which group(s) the diff covers — from the checked boxes and the commits — and treat every other group's scenarios as out of scope. Without this the Spec axis reports the rest of the change as "missing".
   - A change **already archived** under `openspec/changes/archive/` is finished work; review against the baseline in `openspec/specs/<capability>/spec.md` instead, which is what the archive synced into.
2. **A GitHub issue**, for a bug fix: `gh issue view <n> --comments`.
3. **A path the user passed** as an argument.
4. Nothing found → the **Spec** sub-agent skips and the report says "no spec available".

### 3. Identify the standards sources

There is no `AGENTS.md` here. The documented conventions live in four places, and they are canonical in this order:

- **`CONTEXT.md`** — the domain language. Its `_Avoid_` lines are hard: a term the glossary rejects (`in flight` for **in development**, `open`/`active`/`WIP`) is a violation wherever it lands, including a comment or a spec.
- **`README.md`** — `## Layout` says which file owns what and states the seam (`server/` is Node-only and never bundled into the client); `## Notes` carries the costs already paid for and why; `## Tests` says what a real test of an inference looks like.
- **`openspec/config.yaml`** — the per-artifact `rules` and the `operations.apply.guidance`. These bind planning artifacts *and* code: comments explain why in the voice of the file around them, a spec states the empty and the broken store, a task group ships with the fixture that proves its inference.
- **`.claude/skills/commit/SKILL.md`** — the hard rule that nothing from the store being developed against reaches this repo: no client directory, absolute home path, capability namespace, change id, `@handle`, or organisation, in code, fixtures, docs, or a commit message. Neutral examples only (`storefront/checkout`, `shared/ui`, `guest-checkout`, `cart`, `stock-alerts`). This one is worth grepping the diff for directly rather than reading for.

Then pick by what the diff touches:

- `server/**` — disk and git access, Node only. Every reading is behind one connect-style handler mounted three ways, so an endpoint cannot work in dev and 404 in the shipped binary.
- `src/**` — the browser app, which reaches the store only through `/api`. All UI comes from Astryx; `src/app.css` is imports plus layout, and a visual choice made here rather than taken from the design system is a finding.
- `lib/**` — the published entries. A changed signature is a published API change and needs its `.d.mts` beside it.
- `test/**` — an inference is tested against a store built to have the thing it infers. A check that returns an empty list on the real store passes whether it works or not.

**Skip what tooling already enforces.** `prettier` covers formatting; `pnpm build` catches an import from `server/` reaching `src/`; `test/imports.test.mjs` catches a JSX tag with no import. Findings there are noise. Spend the axis on what no tool catches: the seam, the vocabulary, a hardcoded store path where `server/store.mjs` should resolve it, a git spawn added to a path that runs on every poll, an inference with no fixture, and whether the diff now requires `openspec validate --specs --changes --strict`.

On top of the repo's documented conventions, the Standards axis always carries the **smell baseline** below — a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even where the repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented convention always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name** — a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy** — a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man** — a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest** — a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

**Standards sub-agent prompt** — include:

- The full diff command and commit list.
- The standards sources you picked in step 3, **plus the smell baseline pasted in full** — the sub-agent has no other access to it.
- The brief: "Report — per file/hunk where relevant — (a) every place the diff breaks a documented convention: cite the file and the rule; and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls — documented conventions can be hard, baseline smells are always judgement calls, and a documented convention overrides the baseline. Grep the diff for any name belonging to the store being developed against; report a hit as a hard violation. Skip anything prettier, the build, or `test/imports.test.mjs` enforces. Name any repo check the diff now requires. Under 400 words."

**Spec sub-agent prompt** — include:

- The diff command and commit list.
- The change id, the task group(s) in scope, and the fetched contents of the proposal, the spec deltas, and the design (or the issue body, for the issue path).
- The brief: "The spec deltas are the acceptance criteria; scenario names are the units. Report: (a) scenarios in the in-scope group(s) that are missing, partial, or have no test naming them; (b) behaviour in the diff nothing asked for (scope creep); (c) scenarios that look implemented but where the implementation looks wrong; (d) any departure from a decision in `design.md` — a departure is a hard finding, not a judgement call. Quote the scenario or design line for each finding. Scenarios outside the in-scope group(s) are out of scope — do not report them as missing. Under 400 words."

If no spec source was found, skip the Spec sub-agent and note it in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings — the two axes are deliberately separate (see _Why two axes_).

Add a short `## Verify` section: the verify step ending each in-scope task group, and which of them are still unchecked. In this repo that is normally `pnpm test`, `pnpm build`, `openspec validate --specs --changes --strict`, and — for anything touching a view — reading the page in the browser, which several groups ask for by name and no command replaces. Report only; checking a task off belongs to whoever owns the group.

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes — that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every convention but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the change asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
