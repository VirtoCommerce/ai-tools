---
name: merge-upstream
description: "Use when bringing upstream vc-frontend changes (its dev branch or a release tag) into a theme fork — vc-frontend-next or a customer's storefront theme — or when a long-lived redesign branch has to absorb its base branch and the merge conflicts."
argument-hint: "[upstream ref: dev | <release tag>]"
---

# merge-upstream — bring vc-frontend into a theme fork

**The fork owns how it looks; upstream owns how it behaves.** Every resolution keeps the fork's markup,
styles and tokens, and carries upstream's logic, props, events, i18n keys and fixes into them.

*Fork* = the repository receiving the changes. *Upstream* = `VirtoCommerce/vc-frontend`. A redesign
branch absorbing its own base branch is the same job, with the redesign branch as the fork.

## 1. Set up in the fork's own clone

- Work in a clone of the fork and add upstream there:
  `git remote add upstream https://github.com/VirtoCommerce/vc-frontend.git`.
  The fork and upstream are separate repositories — never add the fork as a remote of an upstream checkout.
- Fetch upstream tags into their own namespace, so they cannot collide with the fork's:
  `git fetch --no-tags upstream '+refs/heads/dev:refs/remotes/upstream/dev' '+refs/tags/*:refs/upstream-tags/*'`
- Pick the ref: `upstream/dev` for vc-frontend-next, a release tag (`refs/upstream-tags/<version>`) for a
  customer theme.
- `git merge-base origin/dev <ref>` must print a commit. If it prints nothing, the fork was copied without
  history: stop and report that — this skill does not cover it.
- Repository-local git settings, once per clone:
  - `git config merge.conflictStyle zdiff3` — conflict markers show the base, so each side's intent is visible.
  - `git config rerere.enabled true` — git records each resolution and replays it when the same conflict comes
    back in the next upstream merge. Seed it from earlier merges with git's `contrib/rerere-train.sh`.
    A replayed resolution is still reviewed like any other.
- Branch from the fork's dev and merge:
  `git switch -c chore/merge-upstream-<ref> origin/dev && git merge --no-ff --no-commit <ref>`.

## 2. Map every conflict before touching one

Set `BASE=$(git merge-base HEAD MERGE_HEAD)`. For each conflicted file, read the fork's change
(`git diff $BASE HEAD -- <f>`), upstream's change (`git diff $BASE MERGE_HEAD -- <f>`), and the upstream
commits behind it (`git log --oneline $BASE..MERGE_HEAD -- <f>`). Open the upstream PR to learn its intent.

Also list the files **both sides changed that merged cleanly**:
`comm -12 <(git diff --name-only $BASE HEAD | sort) <(git diff --name-only $BASE MERGE_HEAD | sort)`,
minus the conflicted ones. A clean merge can still be wrong — a fork token that overrides a variable
upstream just fixed silently switches the fix off.

| Kind of conflict | Resolution |
|---|---|
| Fork restyled a template, upstream added behavior to it (conditions, props, handlers) | Fork's markup; port upstream's behavioral edits into it. Translate upstream identifiers the fork renamed (e.g. `isMobile` → `isCompact`) only after checking they mean the same breakpoint. |
| The same feature built on both sides | Upstream's API — prop names, i18n keys, component split — with the fork's visual deltas reapplied. Keeping the fork's API re-conflicts on every later merge. |
| A variable or token renamed on both sides | Upstream's names, the fork's values. |
| Generated: `yarn.lock`, `**/api/graphql/types.ts`, `client-app/core-api/contract/` | Never hand-merged. `yarn install` rewrites the lockfile; GraphQL types follow the backend, so take upstream's and regenerate (`yarn generate:graphql-types`) if a backend is reachable; the contract comes from `yarn build:core-types`. |
| Versions | Root `package.json`: the fork's app version. `client-app/core-api/package.json`: the higher one. |
| Docs | Both sides' content, then corrected against the merged code. |

## 3. Brief, then wait

Post the brief and stop. Nothing is resolved before the user answers.

```
N conflicts: X obvious, Y need you.

### 1. <file(s)> — <topic>
- fork: <what it did, one line>
- upstream: <what it did, one line> (<PR link>)
- ✅ <resolution>
- ⚠️ <side effect, only when there is one>

### ❓ Your call
1. <question, recommended option first>
```

One heading per conflict; related files share one; the hardest is marked ❗. Clean-but-risky files from
step 2 go in as ⚠️ items.

## 4. Resolve and verify

- Apply the agreed resolutions, then check for leftovers: `git diff --check`.
- Run `yarn install`, any regeneration from step 2, `yarn validate:types`, `yarn lint`,
  `yarn test:unit --run`, `yarn check-locales`, `yarn build-only`.
- A failure the merge caused is fixed in the merge commit. A failure already present on either parent is
  reported, not fixed here.

## 5. Commit, push, PR — landed as a merge commit

- Commit: `chore: merge upstream vc-frontend <ref>`, with each conflict and its resolution in the body.
- PR body: the brief from step 3 with the decisions filled in.
- **The PR lands as a merge commit.** A squash drops upstream as a parent, so the next merge starts from
  the old merge base and replays every conflict. If the fork allows only squash, the PR says so and asks
  the maintainer to enable merge commits, or to merge locally with `git merge --no-ff` and push.

## Tools for large jumps

- **`git imerge`** (`pip install git-imerge`) splits a merge into commit-by-commit pairs and stops at the
  exact pair that conflicts. Worth it when a customer jumps many releases at once; a regular `dev` merge
  does not need it.
- **`mergiraf`** — a syntax-aware merge driver that resolves conflicts git reports for code that did not
  really overlap. It covers `.ts`, `.json` (locales) and `.yaml`, not `.vue`, `.scss` or `.md`, so it
  only helps with part of a theme merge. Register it for those extensions only.

## Common mistakes

| Mistake | Instead |
|---|---|
| The fork added as a remote of an upstream checkout | A separate clone of the fork, with upstream as its remote |
| Resolving before the brief is answered | Brief, wait, resolve |
| Taking upstream's whole file to "get the fix" into a restyled component | Fork's markup + upstream's behavior |
| Hand-merging `types.ts` or the lockfile | Regenerate |
| Checking only the conflicted files | Also the files both sides changed |
| Squash-merging the PR | A merge commit |
