---
name: merge-upstream
description: "Use when bringing upstream vc-frontend changes (its dev branch or a release tag) into a theme fork — vc-frontend-next or a customer's storefront theme — or when a long-lived redesign branch has to absorb its base branch and the merge conflicts."
argument-hint: "[upstream ref: upstream/dev | <release tag> | origin/dev for a redesign branch]"
---

# merge-upstream — bring vc-frontend into a theme fork

**Start by telling the user, as your first line:** `⚠️ This skill can make mistakes — review every change before merging.`

**The fork owns how it looks; upstream owns how it behaves.** Every resolution keeps the fork's markup,
styles and tokens, and carries upstream's logic, props, events, i18n keys and fixes into them.

*Fork* = the side receiving the changes. *Upstream* = `VirtoCommerce/vc-frontend`.

The merge stops twice for the user: after the brief (step 3) and before the push (step 9). Nothing is
merged into the fork's `dev` by this skill — the user merges the PR.

Every merge leaves a log in the fork: `upstream-merges/<YYYY-MM-DD>-<ref>.md`, one file per session
(`-2` for a second one that day), next to `fork-map.json`. The PR body is gone from view once merged and
`rerere` keeps only *how* a conflict was resolved; the log keeps *why*, the user's decisions, what was
deferred and what QA could not reach — and the next merge reads it before asking anything. Upstream never
has the folder and each session writes a new file, so logs cannot conflict. The first logged merge also
adds `upstream-merges/README.md`: what the folder is, and that upstream merges land as merge commits.

## 1. Set up

**First, name the repositories.** Run `git remote -v` in full — never cut it with `head` — and write
down which `owner/repo` each remote is, which one this merge writes to (the PR's repository), and
which one is only read. A clone may carry both: a redesign branch merging its own `origin/dev` can
live in a fork clone that also has an `upstream` remote, and the same branch name can exist, with a
PR, in both repositories.

**Every `gh` command takes `--repo <owner/repo>`.** In a clone with an `upstream` remote, a bare `gh`
resolves to *upstream*, not `origin` — `gh pr list --head <branch>` then finds upstream's PR for a
same-named branch, and its checks, conflicts and comments look like the fork's. Check what a bare `gh`
would hit with `gh repo view --json nameWithOwner`, and pass `--repo` anyway. Upstream PR links in the
brief, the log and the PR body are written in full (`VirtoCommerce/vc-frontend#2501`): a bare `#2501`
resolves against the repository it is read in.

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
- If `chore/merge-upstream-<ref>` already exists, look before reusing the name. It is a leftover when
  `git log origin/dev..<branch>` prints nothing and `git ls-remote origin refs/heads/<branch>` finds no
  remote copy: recreate it with `git switch -C chore/merge-upstream-<ref> origin/dev` and say so. Commits
  on it, or a remote copy, mean an unfinished merge: stop and ask whether to resume it or start over.

**Redesign branch absorbing its own base** (same repository): the branch is the fork, `origin/dev` is
upstream. No remote, no new branch — check the branch out and `git merge --no-ff --no-commit origin/dev`.

Either way, **before the merge command**, in this clone:

```bash
git config merge.conflictStyle zdiff3   # markers show the base, so each side's intent is visible
git config rerere.enabled true          # record each resolution, replay it when the same conflict returns
git config rerere.autoUpdate false      # a replay is applied to the file but not staged: someone reviews it
git config gc.rerereResolved 365        # default 60 days; upstream merges are often further apart
```

`rerere` is a safety net, not a resolver: it replays a resolution only for a conflict whose text on both
sides is identical to one already resolved in this clone. Once a merge lands as a merge commit its
conflicts do not come back, so a replay happens when a merge is redone — aborted and restarted, a trial
merge followed by the real one, or a squashed PR merged again. Its cache (`.git/rr-cache`) is local and
starts empty in a fresh clone; that is fine, the logs carry the decisions.

## 2. Map every conflict before touching one

**Read the earlier logs first** (`upstream-merges/`, newest first): every "Decisions that carry forward"
section, and the "Lost features and deferrals" of the latest few. A conflict an earlier decision already
settles is resolved the same way and cited in the brief (`per upstream-merges/<file>`), not asked again —
unless upstream changed the very thing the decision rests on, which the brief then says. A missing folder
means this is the first logged merge.

**Replayed resolutions first.** The merge prints `Resolved '<file>' using previous resolution.` for each
conflict `rerere` replayed; `git diff --name-only --diff-filter=U` still lists those files, but without
markers. Each one is a conflict like any other: map it below and put it in the brief as
`✅ replayed by rerere — <what the replay did>`, checked against the fork's and upstream's diffs. It is
staged only after the brief is answered, never on the strength of the replay.

Set `BASE=$(git merge-base HEAD MERGE_HEAD)` and `export LC_ALL=C` (`comm` needs the same collation as
`sort`). For each conflicted file read the fork's change (`git diff $BASE HEAD -- <f>`), upstream's
(`git diff $BASE MERGE_HEAD -- <f>`) and the upstream commits behind it
(`git log --oneline $BASE..MERGE_HEAD -- <f>`); open the upstream PR to learn its intent
(`gh pr view <n> --repo <upstream owner/repo>`).

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
step 2 go in as ⚠️ items. A resolution taken from an earlier log says so: `✅ <resolution> (per
upstream-merges/<file>)`.

Start the session's log from [log-template.md](log-template.md) as soon as the user answers: the
conflicts, the decisions and who made them. Fill it in as the later steps produce results.

## 4. Resolve and verify the build

- Apply the agreed resolutions, then check for leftovers: `git diff --check`. `git add` each replayed
  file only once its replay matches what the brief agreed. If it does not, run `git rerere forget <file>`
  (the file is left as it is) and correct it: without the `forget`, `rerere` keeps the old resolution
  and replays it again at the next merge.
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

## 9. Log, commit, push, PR — landed as a merge commit

- Commit: `chore: merge upstream vc-frontend <ref>` (or `chore: merge dev into <branch>`), each conflict
  and its resolution in the body. Push only after the user says so.
- Finish the log: every section of the template, filled from steps 3–8 and the port's brief. "Decisions
  that carry forward" holds only rules a later merge must keep, each with its reason — a fork identifier
  that is deliberately not upstream's, a fork value kept over an upstream fix, a feature left out on
  purpose. One-off resolutions stay in the Conflicts table. Commit it last, before the push:
  `docs: log upstream merge <ref>`. If the user corrects a decision during the PR, update the log in the
  same branch.
- PR body: the brief from step 3 with the decisions filled in, the step 4–7 results, the step 8 checklist,
  and a link to the log.
- **The branch may already have a PR** — always, for a redesign branch absorbing its base. Find it
  (`gh pr list --repo <owner/repo> --head <branch> --state open`) and add the merge's section to its body
  instead of opening a second PR: read the body first, append under a `## Merge of <ref>` heading, and
  write it back whole with `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@<file>`, keeping
  everything already there (CI fills fields such as an artifact URL into it). Say in the chat that the
  existing PR was updated, with its link. The step ends when the PR — new or existing — shows the QA
  checklist.
- **An upstream merge lands as a merge commit — never squash, never rebase.** Either one drops upstream
  as a parent: `git merge-base` stays at the old base, so the next merge replays every upstream commit and
  every conflict of this one. Whoever clicks Merge reads the PR, not this skill, so:
  - The PR body opens with: `⚠️ Merge with "Create a merge commit" — not squash or rebase. Squashing drops
    <ref> as a parent and the next upstream merge replays all of these conflicts.`
  - Check the repository before opening the PR:
    `gh api repos/<owner>/<repo> --jq '{allow_merge_commit, allow_squash_merge, allow_rebase_merge}'` and
    `gh api repos/<owner>/<repo>/branches/<base>/protection --jq .required_linear_history.enabled`. Merge
    commits must be allowed and linear history off; if not, say so in the PR and to the user rather than
    squash. When squash is allowed too — the usual case — the warning line is what prevents it.
  - After the user merges, confirm it: `git rev-list --parents -1 <merge sha on the base branch>` prints
    two parents, and `git merge-base origin/dev <ref>` prints the upstream commit merged. If it was
    squashed, say so at once: the fix is a fresh merge of `<ref>`, which `rerere` (in this same clone)
    and the log make cheap while they are fresh.

## Common mistakes

| Mistake | Instead |
|---|---|
| The fork added as a remote of an upstream checkout | A separate clone of the fork, with upstream as its remote |
| Resolving before the brief is answered | Brief, wait, resolve |
| Taking upstream's whole file to "get the fix" into a restyled component | Fork's markup + upstream's behavior |
| Hand-merging `types.ts` or the lockfile | Regenerate |
| Checking only the conflicted files | Also the files both sides changed, and `vc-frontend:port-upstream-to-fork` for code the fork stopped rendering |
| Trusting a passing upstream test without a mutation | Remove a ported line, watch it fail |
| A bare `gh` in a clone with an `upstream` remote | `--repo <owner/repo>` on every `gh` command; it otherwise reads and writes upstream |
| Squash- or rebase-merging an upstream merge | A merge commit; the PR body's first line says so |
| Asking again what an earlier log already decided | Read `upstream-merges/` in step 2; cite the log |
| Decisions only in the PR body or the chat | The session's log in `upstream-merges/`, committed with the merge |
