---
name: merge-upstream
description: "Use when bringing upstream vc-frontend changes (its dev branch or a release tag) into a theme fork — vc-frontend-next or a customer's storefront theme — or when a long-lived redesign branch has to absorb its base branch and the merge conflicts."
argument-hint: "[upstream ref: upstream/dev | <release tag> | origin/dev for a redesign branch]"
---

# merge-upstream — bring vc-frontend into a theme fork

**The fork owns how it looks; upstream owns how it behaves.** Every resolution keeps the fork's markup,
styles and tokens, and carries upstream's logic, props, events, i18n keys and fixes into them.

*Fork* = the side receiving the changes. *Upstream* = `VirtoCommerce/vc-frontend`.

The merge stops twice for the user: after the brief (step 3) and before the push (step 9). Nothing is
merged into the fork's `dev` by this skill — the user merges the PR.

## 1. Set up

**Fork repository** (vc-frontend-next, a customer theme):

- Work in a clone of the fork and add upstream there:
  `git remote add upstream https://github.com/VirtoCommerce/vc-frontend.git`.
  The fork and upstream are separate repositories — never add the fork as a remote of an upstream checkout.
- Fetch upstream tags into their own namespace, so they cannot collide with the fork's:
  `git fetch --no-tags upstream '+refs/heads/dev:refs/remotes/upstream/dev' '+refs/tags/*:refs/upstream-tags/*'`
- Ref: `upstream/dev` for vc-frontend-next, a release tag (`refs/upstream-tags/<version>`) for a customer theme.
- `git merge-base origin/dev <ref>` must print a commit. If it prints nothing, the fork was copied without
  history: stop and report that — this skill does not cover it.
- `git switch -c chore/merge-upstream-<ref> origin/dev && git merge --no-ff --no-commit <ref>`

**Redesign branch absorbing its own base** (same repository): the branch is the fork, `origin/dev` is
upstream. No remote, no new branch — check the branch out and `git merge --no-ff --no-commit origin/dev`.

Either way, once per clone:

- `git config merge.conflictStyle zdiff3` — conflict markers show the base, so each side's intent is visible.
- `git config rerere.enabled true` — git records each resolution and replays it when the same conflict comes
  back. Seed it from earlier merges with git's `contrib/rerere-train.sh`. A replayed resolution is still reviewed.

## 2. Map every conflict before touching one

Set `BASE=$(git merge-base HEAD MERGE_HEAD)` and `export LC_ALL=C` (`comm` needs the same collation as
`sort`). For each conflicted file read the fork's change (`git diff $BASE HEAD -- <f>`), upstream's
(`git diff $BASE MERGE_HEAD -- <f>`) and the upstream commits behind it
(`git log --oneline $BASE..MERGE_HEAD -- <f>`); open the upstream PR to learn its intent.

List the files **both sides changed that merged cleanly**:
`comm -12 <(git diff --name-only $BASE HEAD | sort) <(git diff --name-only $BASE MERGE_HEAD | sort)`,
minus the conflicted ones. A clean merge can still be wrong: a fork token can override a variable upstream
just fixed, and a conflicted file's clean hunks can pair one side's API with the other side's code
(a `computed` reading a prop the other side removed).

| Kind of conflict | Resolution |
|---|---|
| Fork restyled a template, upstream added behavior to it (conditions, props, handlers) | Fork's markup; port upstream's behavioral edits into it. Translate identifiers the fork renamed (e.g. `isMobile` → `isCompact`) only after checking they mean the same breakpoint. |
| The same feature built on both sides | Upstream's API — prop names, i18n keys, component split — with the fork's visual deltas reapplied. Keeping the fork's API re-conflicts on every later merge. |
| A variable or token renamed on both sides | Upstream's names, the fork's values. |
| Generated: `yarn.lock`, `**/api/graphql/types.ts`, `client-app/core-api/contract/` | Never hand-merged. `yarn install` rewrites the lockfile; GraphQL types follow the backend, so take upstream's and regenerate (`yarn generate:graphql-types`) if a backend is reachable; the contract comes from `yarn build:core-types`. |
| Versions | Root `package.json`: the fork's app version. `client-app/core-api/package.json`: the higher one. |
| Docs | Both sides' content, corrected against the merged code. |
| Upstream's test for a component the fork refactored | Keep upstream's assertions; change only its mocks/setup to the fork's dependencies. |

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

## 4. Resolve and verify the build

- Apply the agreed resolutions, then check for leftovers: `git diff --check`.
- Run `yarn install`, any regeneration from step 2, `yarn validate:types`, `yarn lint`,
  `yarn test:unit --run`, `yarn check-locales`, `yarn build-only`.
- A failure the merge caused is fixed in the merge commit. A failure already present on both parents is
  reported, not fixed: re-run the failing check against each parent's version of the file to tell which.
- Format only the files you resolved. `prettier --write` on a file the fork had left unformatted rewrites
  it whole — leave those as they were.

## 5. Trace every upstream change into the result

For every file in step 2's two lists, the lines upstream added must exist in the merged file, or be
replaced by a resolution you can name:

```bash
export LC_ALL=C; P1=HEAD^1; P2=HEAD^2; BASE=$(git merge-base $P1 $P2)   # after the merge commit
git diff -U0 $BASE $P2 -- "$f" | grep '^+' | grep -v '^+++' | sed 's/^+[[:space:]]*//' | grep -v '^$' | sort -u > up.txt
git show HEAD:"$f" | sed 's/^[[:space:]]*//' | sort -u > merged.txt
comm -23 up.txt merged.txt        # each line printed needs a reason
```

Then the case no line diff shows: **upstream changed code the fork no longer renders**, or renders from
fewer places. **REQUIRED SUB-SKILL:** run `vc-frontend:port-upstream-to-fork` on the merge commit; its
ports join this PR and its brief joins step 3's questions.

## 6. Tests

1. Upstream's own tests for each feature it changed run against the fork's markup in step 4. Prove they
   guard the ported code: remove one ported condition at a time (back the file up with `cp`, not
   `git checkout`) and watch a test fail. A ported line no test fails on is uncovered.
2. Write a test only for uncovered ported behavior, in `<component>.upstream.test.ts` beside the component.
   The suffix never exists upstream, so the file can never conflict, and it tells the next person that the
   fork's markup must keep it green. Name `describe`/`it` by behavior, no ticket numbers.

## 7. Smoke the built app

- `yarn build-only`, then `npx vite preview --port 3100 --strictPort` (3000 is usually the developer's own
  server) with `APP_BACKEND_URL` in `.env.local`. `vite-plugin-mkcert` runs here too: in a fresh clone,
  copy `.certificates/` from a clone where the CA is already installed, or `mkcert -install` needs sudo.
- Open the home page, then every page the merged files render (catalog, search, the account pages,
  modules). On each: console errors, no `vite-error-overlay`, no error toast or `[role="alert"]`,
  GraphQL responses without `errors`. Cross-origin resources (fonts, analytics) report status 0 — not
  a failure.
- Exercise each upstream feature in the merge on the page, in the state that switches it on (a query
  param, a setting, a signed-in user). Note what the backend could not reach — it goes to QA.

## 8. QA checklist

For each upstream feature and each conflict resolution, one block in the PR body:

```
### <feature / area> — <upstream PR or "resolution">
Where: <page or component>
- [ ] <scenario: state → action → expected result>
Not covered by the smoke: <what needs data, a role or a device the smoke did not have>
```

## 9. Commit, push, PR — landed as a merge commit

- Commit: `chore: merge upstream vc-frontend <ref>` (or `chore: merge dev into <branch>`), each conflict
  and its resolution in the body. Push only after the user says so.
- PR body: the brief from step 3 with the decisions filled in, the step 4–7 results, the step 8 checklist.
- **An upstream merge lands as a merge commit.** A squash drops upstream as a parent, so the next merge
  starts from the old merge base and replays every conflict. The fork needs *Allow merge commits* enabled
  and no *Require linear history* on `dev`; if either is missing, say so in the PR rather than squash it.

## Common mistakes

| Mistake | Instead |
|---|---|
| The fork added as a remote of an upstream checkout | A separate clone of the fork, with upstream as its remote |
| Resolving before the brief is answered | Brief, wait, resolve |
| Taking upstream's whole file to "get the fix" into a restyled component | Fork's markup + upstream's behavior |
| Hand-merging `types.ts` or the lockfile | Regenerate |
| Checking only the conflicted files | Also the files both sides changed, and `vc-frontend:port-upstream-to-fork` for code the fork stopped rendering |
| Trusting a passing upstream test without a mutation | Remove a ported line, watch it fail |
| Squash-merging an upstream merge | A merge commit |
