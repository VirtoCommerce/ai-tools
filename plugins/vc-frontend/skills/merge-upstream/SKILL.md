---
name: merge-upstream
description: "Use when bringing upstream vc-frontend changes (its dev branch or a release tag) into a theme fork — vc-frontend-next or a customer's storefront theme — or when a long-lived vc-frontend redesign branch has to absorb its base branch and the merge conflicts."
argument-hint: "[upstream ref: upstream/dev | <release tag> | origin/<base> for a redesign branch]"
---

# merge-upstream — bring vc-frontend into a theme fork

**The fork owns how it looks; upstream owns how it behaves.** Every resolution keeps the fork's markup,
styles and tokens, and carries upstream's logic, props, events, i18n keys and fixes into them.

*Fork* = the side receiving the changes. *Upstream* = `VirtoCommerce/vc-frontend`.

The merge stops for the user up to three times: after the brief (step 3), after the port brief when
`port-upstream-to-fork` finds something (step 5), and before the push (step 9). Nothing is merged into
the fork's base branch by this skill — the user merges the PR.

**Track the nine steps as a checklist from the start** (a task list where the client has one); close a
step only when it is done or the user said, in those words, to skip it. A request mid-merge — a
screenshot, a question — is done *in addition*, then resume at the first open step. **Step 5 updates the
fork's own components and is the step that gets lost**: a green build after step 4 feels like the end,
and is not. The log, push and PR (step 9) wait until step 5 has run on the merge commit.

Every merge leaves a log in the fork, next to `fork-map.json`: `upstream-merges/<YYYY-MM-DD>-<slug>.md`,
one file per session (`-2` for a second that day). `<slug>` is the ref without `refs/upstream-tags/`, each
`/` made `-` (`upstream/dev` → `upstream-dev`). `rerere` keeps only *how*; the log keeps *why* — decisions,
deferrals, what QA could not reach — and the next merge reads it before asking anything. One new file per
session, in a folder upstream never has, so logs cannot conflict. The first one also adds
`upstream-merges/README.md`: what the folder is, and that upstream merges land as merge commits.

## 1. Set up

**First, name the repositories.** Run `git remote -v` in full (never through `head`) and write down which
`owner/repo` each remote is, which one this merge writes to (the PR's) and which is only read: a branch
name can exist, with a PR, in both.

**Every `gh` command takes `--repo <owner/repo>`.** With an `upstream` remote a bare `gh` resolves to
*upstream*, and upstream's PR for a same-named branch passes for the fork's. Upstream PR links are written
in full (`VirtoCommerce/vc-frontend#2501`): a bare `#2501` resolves against the repository it is read in.

**Start from a clean tree:** `git status --porcelain` prints nothing, or stop and ask the user to commit or
stash. Uncommitted edits ride into the merge commit, and `git merge --abort` cannot always restore them.

**Name the base:** `<base>` below is the branch the merge PR targets — the fork's default branch
(`gh repo view <owner/repo> --json defaultBranchRef --jq .defaultBranchRef.name`; `dev` in vc-frontend-next),
or the branch a redesign branch was cut from. Ask if unsure; note it in the log.

**Fetch `origin` first:** `git fetch --prune origin`. Both cases below start from `origin/<base>`; a stale
ref leaves the fork's latest commits out, and `--prune` drops branches the remote deleted. Run `yarn` as
`corepack yarn` unless `yarn --version` prints 4.x: a global Yarn 1 refuses vc-frontend's `packageManager`.

**Before either merge below**, set these in this clone:

```bash
git config merge.conflictStyle zdiff3   # markers show the base, so each side's intent is visible
git config rerere.enabled true          # record each resolution, replay it when the same conflict returns
git config rerere.autoUpdate false      # a replay is applied to the file but not staged: someone reviews it
git config gc.rerereResolved 365        # default 60 days; upstream merges are often further apart
```

`zdiff3` needs git 2.35 or newer (`git --version`); with an older git use `diff3`.
They stay in this clone's `.git/config`, so read each first (`git config --get <key>`): a different value
is the user's — ask before replacing it. Tell the user what was set and how to undo it
(`git config --unset <key>`), and note it in the log.

`rerere` is a safety net, not a resolver: it replays only a conflict resolved before in this clone with the
same text on both sides (a merge redone, a trial merge, a squashed PR merged again). Its cache
(`.git/rr-cache`) is local and starts empty in a fresh clone; the logs carry the decisions.

**Fork repository** (vc-frontend-next, a customer theme):

- Work in a clone of the fork (never add the fork as a remote of an upstream checkout) and add upstream,
  with no tags of its own fetched into the fork's `refs/tags` (tell the user, as above):
  `git remote add upstream https://github.com/VirtoCommerce/vc-frontend.git && git config remote.upstream.tagOpt --no-tags`
- Fetch upstream's tags into their own namespace, so they cannot collide with the fork's:
  `git fetch --no-tags upstream '+refs/heads/dev:refs/remotes/upstream/dev' '+refs/tags/*:refs/upstream-tags/*'`
- Ref: `upstream/dev` for vc-frontend-next, a release tag (`refs/upstream-tags/<version>`) for a customer theme.
- `git merge-base origin/<base> <ref>` must print a commit. If it prints nothing, the fork was copied without
  history: stop and report that — this skill does not cover it. If `git merge-base --is-ancestor <ref>
  origin/<base>` succeeds, the ref is merged already: say so and stop (`port-upstream-to-fork` can still audit).
- `git switch --no-track -c chore/merge-upstream-<slug> origin/<base>` (a branch that tracks it points a
  bare `git push` at `<base>`), `yarn check-locales > <scratchpad>/locales-before.txt 2>&1` (step 4 compares
  against it), then `git merge --no-ff --no-commit <ref>`.
- If `chore/merge-upstream-<slug>` exists and neither it (`git log origin/<base>..<branch>`) nor
  `origin/<branch>` (`git merge-base --is-ancestor origin/<branch> origin/<base>`) has commits
  `origin/<base>` lacks, it is finished or a leftover: recreate it (`git switch --no-track -C …`) and say so. Otherwise ask
  whether to resume it or start over as `chore/merge-upstream-<slug>-2`; never recreate or force-push it.

**Redesign branch absorbing its own base** (same repository): the branch is the fork, `origin/<base>` is
upstream. No remote, no new branch — check the branch out, bring it level with its remote copy
(`git merge --ff-only origin/<branch>`; if that fails, the two have diverged: stop and ask). If
`git merge-base --is-ancestor origin/<base> HEAD` succeeds, there is nothing to merge: say so and stop.
Otherwise save `locales-before.txt` as above, then `git merge --no-ff --no-commit origin/<base>`.

## 2. Map every conflict before touching one

**Read the earlier logs first** (`upstream-merges/`, newest first): every "Decisions that carry forward"
section, and the "Lost features and deferrals" of the latest few. A conflict an earlier decision already
settles is resolved the same way and cited (`per upstream-merges/<file>`), not asked again — unless
upstream changed what the decision rests on, which the brief then says. No folder: the first logged merge.

**Replayed resolutions first.** The merge prints `Resolved '<file>' using previous resolution.` for each
conflict `rerere` replayed; `git diff --name-only --diff-filter=U` still lists them, without markers. Map
each like any conflict and brief it as `✅ replayed by rerere — <what the replay did>`, checked against both
sides' diffs. It is staged only after the brief is answered.

For each conflicted file read the fork's change (`git diff MERGE_HEAD...HEAD -- <f>`), upstream's
(`git diff HEAD...MERGE_HEAD -- <f>`; three dots diff from the merge base) and the upstream commits behind
it (`git log --oneline HEAD..MERGE_HEAD -- <f>`); open the upstream PR to learn its intent
(`gh pr view <n> --repo <upstream owner/repo>`).

List the files **both sides changed that merged cleanly**, minus the conflicted ones (`comm` needs
`sort`'s collation, hence `LC_ALL=C`):

```bash
export LC_ALL=C; comm -12 <(git diff --name-only MERGE_HEAD...HEAD | sort) <(git diff --name-only HEAD...MERGE_HEAD | sort)
```

A clean merge can still be wrong: a fork token can override a variable upstream
just fixed, and a conflicted file's clean hunks can pair one side's API with the other side's code
(a `computed` reading a prop the other side removed).

| Kind of conflict | Resolution |
|---|---|
| Fork restyled a template, upstream added behavior to it (conditions, props, handlers) | Fork's markup; port upstream's behavioral edits into it. Translate identifiers the fork renamed (e.g. `isMobile` → `isCompact`) only after checking they mean the same breakpoint. |
| The same feature built on both sides | Upstream's API — prop names, i18n keys, component split — with the fork's visual deltas reapplied. Keeping the fork's API re-conflicts on every later merge. |
| A variable or token renamed on both sides | Upstream's names, the fork's values. |
| Generated: `yarn.lock`, `**/api/graphql/types.ts`, `client-app/core-api/contract/` | Never hand-merged: `yarn install` rewrites the lockfile; take upstream's GraphQL types and regenerate (`yarn generate:graphql-types`) if a backend is reachable; the contract comes from `yarn build:core-types`. |
| Versions and package name | Root `package.json`: the fork's `name` and app version (the fork releases its own; archives are named after `name`). `client-app/core-api/package.json`: the higher one. |
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
step 2 go in as ⚠️ items. A resolution from an earlier log says `(per upstream-merges/<file>)`.

Start the session's log from [log-template.md](log-template.md) once the user answers (conflicts,
decisions, who made them), and fill it in as later steps produce results.

## 4. Resolve and verify the build

- Apply the agreed resolutions, then check for leftovers: `git diff --check; git diff --cached --check`.
  Stage only the files you resolved, not the log (step 9 commits it). `git add` a replayed file only once
  its replay matches the brief. If it does not, `git rerere forget <file>` (the file stays as it is) and
  correct it: without the `forget`, `rerere` replays the old resolution at the next merge.
- Run `yarn install`, any regeneration from step 2, `yarn validate:types`, `yarn lint`,
  `yarn test:unit --run`, `yarn check-locales`, `yarn build-only`. `check-locales` always exits 0: a key
  missing now but not in `locales-before.txt` is a failure (lost by the merge, or untranslated upstream).
- A failure the merge caused is fixed in the merge commit. A failure already present on both parents is
  reported, not fixed. To tell which, run the check in a temporary worktree of each parent
  (`git worktree add --detach "$(mktemp -d)" HEAD`, then `MERGE_HEAD`), never by checking a parent's file
  out into the merge: that overwrites the resolution.
- Format only the files you resolved: `prettier --write` on a file the fork left unformatted rewrites it.
- Commit the merge locally once the checks are done: `chore: merge upstream vc-frontend <ref>` (or
  `chore: merge <base> into <branch>`), each conflict and its resolution in the body. Note its SHA in the log:
  steps 5 and 6 read its parents. Nothing is pushed yet. **The next action is step 5**, whatever else was
  asked in the meantime.

## 5. Update the fork: trace every upstream change into the result — never skipped

For every file in step 2's two lists, the lines upstream added must exist in the merged file, or be
replaced by a resolution you can name. Skip the regenerated files (lockfile, GraphQL types, contract). Run
it as one command (a shell variable does not reach the next call), `M` being the merge commit:

```bash
M=<merge sha>; T=$(mktemp -d); export LC_ALL=C
for f in <the files>; do
  git diff -U0 $M^1...$M^2 -- "$f" | grep '^+' | grep -v '^+++' | sed 's/^+[[:space:]]*//' | grep -v '^$' | sort -u > "$T/up.txt"
  git show $M:"$f" | sed 's/^[[:space:]]*//' | sort -u > "$T/merged.txt"
  comm -23 "$T/up.txt" "$T/merged.txt" | sed "s|^|$f: |"   # each line printed needs a reason
done; rm -rf "$T"
```

Then the case no line diff shows: **upstream changed code the fork no longer renders**, or renders from
fewer places. **REQUIRED SUB-SKILL:** run `vc-frontend:port-upstream-to-fork` on the merge commit `M`. Its
brief is the second pause; its ports are committed on this branch and join this PR.

Both halves run on every merge, a quiet one too: a range with no conflicts can still change a component
the fork replaced. "Nothing to port" is a result, said with the drift report's sections, never a skip. Step 5 is done when the line trace has a reason for every printed line,
and the port brief is answered (or the report found nothing).

## 6. Tests

1. Upstream's tests for each feature it changed ran against the fork's markup in step 4. Prove they guard
   the ported code: remove one ported condition at a time (back the file up with `cp`, not
   `git checkout`), watch a test fail, restore. A ported line no test fails on is uncovered.
2. Write a test only for uncovered ported behavior, in `<component>.upstream.test.ts` beside the component
   (the suffix never exists upstream, so it cannot conflict, and says the fork's markup must keep it
   green). Name `describe`/`it` by behavior, no ticket numbers. Commit them:
   `test: guard upstream <behavior> in the fork's markup`.

## 7. Smoke the built app

- `yarn build-only`, then `yarn preview --port 3100 --strictPort` in the background, with `APP_BACKEND_URL`
  in `.env.local` (3000 is usually the developer's own server; if 3100 is taken, pick another port and leave
  that server alone). It serves https through `vite-plugin-mkcert`: in a fresh clone, copy `.certificates/`
  from a clone whose CA is installed, or the user runs `mkcert -install` themselves — it adds a CA to the OS
  trust store, so never run it for them.
- Open the home page, then every page the merged files render (catalog, search, account pages, modules).
  On each: no console errors, `vite-error-overlay`, error toast or `[role="alert"]`, and GraphQL responses
  without `errors`. Cross-origin resources (fonts, analytics) at status 0 are not a failure.
- Exercise each upstream feature in the merge on the page, in the state that switches it on (a query
  param, a setting, a signed-in user — the user signs in; no credentials go into the log or the PR). Note
  what the backend could not reach — it goes to QA.
- Stop the preview you started, and only that one.

## 8. QA checklist

For each upstream feature and each conflict resolution, one block in the PR body:

```
### <feature / area> — <upstream PR or "resolution">
Where: <page or component>
- [ ] <scenario: state → action → expected result>
Not covered by the smoke: <what needs data, a role or a device the smoke did not have>
```

## 9. Log, push, PR — landed as a merge commit

- **Gate:** every step 1–8 is done or skipped by the user in words. Step 5 open → go back to it now; the
  log's Ports section is filled from its drift report, so a log without one is not finished.
- The merge commit (step 4), the ports (step 5) and the tests (step 6) are already committed. Push only after the user says
  so, and never with `--force`: `git push -u origin <branch>`.
- Finish the log: every template section, from steps 3–8 and the port's brief. "Decisions that carry
  forward" holds only rules a later merge must keep, each with its reason (a fork identifier deliberately
  not upstream's, a fork value kept over an upstream fix, a feature left out on purpose); one-off
  resolutions stay in the Conflicts table. Commit it last, before the push: `docs: log upstream merge
  <ref>`. A decision the user corrects during the PR is updated in the log on the same branch.
- PR body: the brief from step 3 with the decisions filled in, the step 4–7 results, the step 8 checklist,
  and a link to the log.
- **The branch may already have a PR** — always, for a redesign branch absorbing its base. Find it
  (`gh pr list --repo <owner/repo> --head <branch> --state open`) and update it, not a second one: read the
  body (CI fills fields such as an artifact URL into it), append `## Merge of <ref>`, write it back whole
  with `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@<scratchpad>/pr-body.md`, and give its link. The step ends
  when the PR shows the QA checklist.
- **An upstream merge lands as a merge commit — never squash, never rebase**: either drops upstream as a
  parent, and the next merge replays every conflict of this one. Open the PR body with the warning line,
  check the repository's merge settings before opening it, and verify the landing after the user merges,
  as [landing.md](landing.md) says.

## Common mistakes

| Mistake | Instead |
|---|---|
| The fork added as a remote of an upstream checkout | A separate clone of the fork, with upstream as its remote |
| Taking upstream's whole file to "get the fix" into a restyled component | Fork's markup + upstream's behavior |
| Checking only the conflicted files | Also the files both sides changed, and `vc-frontend:port-upstream-to-fork` for code the fork stopped rendering |
| Stopping after a green build, or a side request, without step 5 | Step 5 right after the merge commit; then resume at the first open step |
| Trusting a passing upstream test without a mutation | Remove a ported line, watch it fail |
| Force-pushing a rejected push, or recreating a pushed branch to start over | The remote moved: fetch and merge it. Start over under a new branch name |
| Squash- or rebase-merging an upstream merge | A merge commit; the PR body's first line says so |
| Decisions only in the PR body or the chat | The session's log in `upstream-merges/`, committed on the merge branch (step 9) |
