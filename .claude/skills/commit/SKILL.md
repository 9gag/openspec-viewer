---
name: commit
description: Commit work in this repository, in its own commit voice and with the checks that have to pass first. Use when the user asks to commit, or to push.
---

# Committing here

This package ships to a registry and its history is public. Two things follow from that,
and they are the reason this skill exists.

## 1. Nothing from outside this project goes in

The viewer is developed by pointing it at a real store, and that store belongs to someone
else — a client, an employer, a private repo. **Its vocabulary must never reach this
one.** Not in comments, not in test fixtures, not in docs, not in a commit message.

That means, from whatever store you have been running against:

- the directory it lives in, and any absolute path under a home directory
- its capability namespaces and change ids
- the `@handles` its git history carries
- the repository or organisation it belongs to

Use the neutral examples this codebase already uses instead:

| where a comment needs               | use                                  |
| ----------------------------------- | ------------------------------------ |
| an application, then an area in it  | `storefront/checkout`                |
| a second namespace beside it        | `shared/ui`                          |
| an id with a digit inside a word    | `tier1-support`                      |
| changes and capabilities in tests   | `guest-checkout`, `cart`, `stock-alerts` |

**Before every commit, grep the diff *and* the message**, not just the diff — a message is
where a real path slips in most easily, because it is written from memory of what you were
looking at:

```bash
git diff --cached | grep -niE '<store dir>|<org>|@<handle>|/Users/'
```

**Before every push, grep every unpushed commit**, not just the tip. Removing a name at the
tip leaves it in the commits behind it and on the `-` side of the commit that removed it:

```bash
git rev-list @{u}..HEAD 2>/dev/null || git rev-list $(git merge-base origin/main HEAD)..HEAD
# then, for each: git grep -li '<term>' <sha>
```

If a name is already in unpushed history, say so and stop. While nothing is pushed the fix
is cheap — `git filter-branch --tree-filter` over the range back to the merge-base with
`main`, which rewrites trees rather than replaying patches and so cannot conflict with
later commits that touch the same lines. After a push it needs a force-push and breaks
every clone, so the decision is the user's, not yours.

## 2. The commit message is prose, not a summary of the diff

Read `git log` before writing one. The house style is a conventional prefix and then a
clause that says what the reader now gets — `feat: open a scenario where the journey names
it`, `refactor: the term is "in development", not "in flight"` — followed by a body that
argues:

- **what was wrong**, concretely and with the real numbers where there are any ("the
  biggest spec in a store here is 708 lines", "twenty-one changes of which seven are
  finished")
- **what it does now**, and
- **why the obvious alternative was not taken.**

Never a bullet list of the files touched; the diff already says that. Wrap at 80.

Finish with whatever attribution trailers the session specifies.

## Splitting

Prefer several commits, each of which builds and passes tests on its own. The test of a
split is not "one file per commit" but **can this commit stand alone**:

- A rename that crosses a producer and its consumers is **one** commit. Renaming an API
  field in one commit and its readers in another leaves a commit that does not build.
- Work that only touches one view, and that nothing else imports, is its own commit.
- A bug fix found while doing something else is its own commit, even in the same file.

Verify rather than assume, in a scratch worktree so the working tree is untouched:

```bash
git worktree add -q --detach /tmp/verify <sha>
ln -s "$PWD/node_modules" /tmp/verify/node_modules
(cd /tmp/verify && npx vite build && node --test test/*.test.mjs)
git worktree remove --force /tmp/verify
```

## Someone else's work in the tree

The working tree often holds changes that were there before this session. Do not fold them
into a commit whose message describes your work. Give them their own commit, described
from the diff and its own comments, and put it **first** if anything of yours depends on
it. Say plainly in your reply which commits were not your work.

Where their work and yours are genuinely entangled in the same functions, one commit is
honest and reconstructing intermediate states you never ran is not. Say which it was.

## Before committing

```bash
npm test          # all must pass
npm run build     # must be clean
npx prettier --check <the files you touched>
```

Six files in this repo are already unformatted and are not yours to fix in passing — check
the files you touched, not the tree. If `prettier --check` flags a file, confirm it was
already flagged at `HEAD` before leaving it alone:

```bash
git show HEAD:<path> | npx prettier --stdin-filepath <path> --check
```

## Pushing

Only when asked. Then run the unpushed-history grep above, and report the remote ref and
the tip you pushed so the user can see they match.
