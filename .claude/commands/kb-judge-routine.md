---
description: "Unattended routine: clone a fresh vc-knowledge, settle a batch of disputed clusters with /kb-judge (one commit per cluster), and stop at ONE open PR. Skips cleanly when another run is open (PR, unpublished branch, lock or kept clone) or the machine is not ready. Meant as the prompt of a scheduled task."
argument-hint: "[--dry-run] [--max-clusters N] [--budget-min M]"
disable-model-invocation: true
---

# /kb-judge-routine — settle a batch of disputed kb clusters, unattended

You are an unattended routine running in this repo. Settle a BATCH of disputed knowledge-base
clusters by running the [`/kb-judge` skill](../skills/kb-judge/SKILL.md) on each in turn, on ONE
branch, one commit per cluster, and stop at ONE open PR. A human merges. Report to the operator in
Russian; everything written to the base or its PR is in English.

**Batch limits:** at most `--max-clusters` clusters (default **8**) and no new cluster started once
`--budget-min` minutes (default **120**) have passed since the start time Step 0 prints (`Get-Date
-Format o`); read the clock again before each cluster and compare. Whichever comes first ends the
batch; a cluster already started is finished or abandoned per Step 3, never cut mid-write.

**Why a batch and not the whole queue:** the PR must stay reviewable in ~15 minutes, a long run is
fragile (sleep, redeploy mid-run, context), and the branch drifts from `main` the longer it lives.
One commit per cluster lets the reviewer reject one verdict without touching the others.

**`--dry-run`:** do Steps 0–3 up to and including the verdicts, but write nothing to the base —
no branch, no `observe`, no `resolve`, no commit, no push, no PR. Report, per cluster, the verdicts
you would have written and the entry edits you would have made (in words: which clause, old → new).

**`<BASE>` is a literal path, never a shell variable.** Every tool call starts a new shell, so a
variable set in one is empty in the next — and `git -C ""` runs against THIS repo. Write the clone's
absolute path from Step 1 into every command below, **with forward slashes and in double quotes**
(`"C:/Users/…/kb-judge/…/vc-knowledge"`): unquoted backslashes are eaten by Git Bash.

## Hard rules

- Never merge a PR, never push to `main` of VirtoCommerce/vc-knowledge, never pass `--force`,
  never run `npm run kb -- push`.
- **Nobody in the batch writes to the kb but `kb:disputes observe` / `resolve`** — no `kb_capture`,
  `kb_confirm`, `kb_dispute`, by you or the specialists; every dispatch brief says so. Findings on
  other entries go into the report as **to capture**. Why and how:
  [`kb-judge-routine.md`](../knowledge/execution/kb-judge-routine.md) §Who writes to the kb.
- No verdict from papers. If a stand, a lane or a source cannot be reached, that dispute stays open
  and the report says what was missing.
- Browser work only through the Playwright lanes (`playwright-chrome`, `playwright-edge`), at most
  three browser agents at once, one agent per lane. If no `mcp__playwright-*` tool loads, stop —
  do not switch browsers.
- Nothing client-specific, no credentials, no emails, no screenshots in the base or the PR: both
  are public.
- Never write into this repo's working tree, except the gitignored `.vc-fix/vc-test/` output of
  `runner plugin deployed`, which the report names (the `git status` comparison cannot see it).
- **Leave no trace on a stand.** Prefer observing over creating. Anything the investigation must
  create there (a page, an upload, an account, an order) is named `AGENT-TEST-kbjudge-<yyyymmdd>-…`
  where the entity has a name, is deleted in the same cluster once observed, and the deletion is
  checked; whatever could not be deleted is listed in the report with its stand and id. In
  `--dry-run` create nothing unless the clause cannot be observed otherwise, and say so per dispute.
  Never touch another run's leftovers.

## Credentials

Passwords come only from vc-secrets; a missing `ADMIN_PASSWORD` in `.env` is by design and never a
blocker. **A lane signs in to ONE stand — the `TEST_ENV` this session started with**; every other
stand is guest-only. How to sign in, read each stand's build (including anonymously), and what stays
`unknown`: [`kb-judge-routine.md`](../knowledge/execution/kb-judge-routine.md) §Credentials and
reachability.

## Step 0 — Gate (skip the run, don't fail it)

Print the start time and the session's `TEST_ENV`, and record `git status --porcelain` of this repo
as the start snapshot. Then stop with a one-line `skipped: <reason>` report if any of these holds:

1. **Another run is open** — an open `judge/*` PR, a `judge/*` branch with no PR, a `RUNNING` lock
   under 6 hours, or a leftover clone with unpublished commits. Two runs on one queue make two judge
   branches, which `/kb-judge` forbids. The PowerShell for each check, and how a stale lock or an
   empty leftover clone is cleared instead of stopping:
   [`kb-judge-routine.md`](../knowledge/execution/kb-judge-routine.md) §Gate.
2. `gh auth status` fails, or `gh api repos/VirtoCommerce/vc-knowledge --jq .permissions.push` is
   not `true`.
3. **`/kb-judge` Step 7's precondition fails:** every client must read resolutions. `kb:disputes`
   must be in the `package.json` of this repo's `origin/main` (`git fetch origin` first).
4. The [`/preflight` skill](../skills/preflight/SKILL.md) reports the stands down or the Playwright
   lanes unavailable. Nothing else it reports stops the run (§Credentials).

Passed → write the `RUNNING` lock (§Gate); Step 5 deletes it.

## Step 1 — Fresh base

Clone into a new folder per run, outside this repo, and print the path you will use as `<BASE>`:

```powershell
$base = Join-Path $env:TEMP "kb-judge\$(Get-Date -Format yyyyMMdd-HHmm)\vc-knowledge"
git clone https://github.com/VirtoCommerce/vc-knowledge.git $base; $base -replace '\\','/'
```

Full clone, no `--depth`: `resolve` compares against `origin/main` and reads history. From here on
the printed absolute path is `<BASE>` in every command (see the note above the hard rules).

## Step 2 — Plan the batch

1. `npm run kb:disputes -- list --base <BASE>` — save the counts as **before**. Queue empty → report
   `queue empty` and go to Step 5.
2. **Which stands this machine can reach, and how.** A dossier names a stand by its kb name
   (`vcst_qa`, `vcptcore_qa1`); vc-secrets and the lanes name it by its `TEST_ENV` (`vcst`). Never
   compare the two spellings — map them: `node scripts/kb/core/stands.mjs` prints kb stand →
   `.env.<env>` (read from each profile's `KB_STAND=`), and `node "$VC_SECRETS" doctor` lists the
   secrets that resolve (`admin-password-<env>`, …). Reachability is per **stand AND role**: an
   admin password is not a sales rep's or a buyer's. The roles a lane can sign in as on an env are
   the `*_PASSWORD` names `.claude/vc-secrets.local.json` declares for `playwright-*.<env>` whose
   secret resolves, each paired with its `<ROLE>_LOGIN` in `.env.<env>`. A (stand, role) is then one of:
   - **signed-in reachable** — the stand maps to the session's `TEST_ENV` (§Credentials: the lanes
     hold no other env's passwords), and that role's password resolves there;
   - **guest reachable** — mapped to an env with a `FRONT_URL` / `BACK_URL`, but not that role;
   - **unreachable** — unmapped, or `local` (someone's own machine: its `localhost` is not theirs).
   Never sign in as a different role than the clause names because its password happens to exist.
3. **Classify every open dispute** from its dossier row and note — by what a verdict needs, not by
   the stand it was made on:
   - **build** — the sides ran on different builds (a `soft` dispute, the dossier's "made on another
     build" hint, or build stamps that differ). A different build is a HYPOTHESIS, not a verdict:
     about a third of such disputes turned out to be simply wrong (`investigation.md` §4, 20 of 65).
     `version-scoped` / `defect-fixed` needs ALL of: (a) the source names the change — a commit or
     PR between the two builds that touches the mechanism of this clause; (b) a live observation
     on a stand running a build at or after that change shows the newer behaviour; (c) the sides
     differ in nothing else the clause can depend on (settings, store, role, data, ingress, browser)
     — read each side's `conditions`, and where one is missing or differs, vary it on a reachable
     stand (`/kb-judge` Step 4.5, one condition at a time). Then the dispute's own stand need not be
     re-observed: its build has moved on. Any of (a)–(c) missing → it is not a `build` dispute;
     re-class it, or leave it `open — cause not isolated: <what differs>`.
   - **guest** — the clause is observable without signing in (storefront as an anonymous visitor, a
     public endpoint). Decided on the stands the evidence names, observed as a guest in the lane's
     browser (each stand's own `FRONT_URL` from its `.env.<env>`). Another stand may only add to
     them, never stand in for them: a named stand that cannot be reached leaves the dispute open.
   - **signed-in** — the clause depends on a role, an account, or the stand's own settings or data.
     Needs THAT (stand, role) signed-in reachable; otherwise it stays
     `open — no credentials for <role> on <stand>` (or `open — <stand> unreachable`).
   A dispute that fits two classes takes the cheaper one first, and falls through to the next only
   if the cheaper one does not decide it.
4. Walk the queue top-down (clusters, worst first; within the same rank prefer an entry with more
   disputes than confirms) and build the batch:
   - **Skip without investigating** a cluster only when EVERY open dispute in it is `signed-in` on a
     (stand, role) that is not signed-in reachable. List it as `skipped — <role> on <stand>` per
     dispute; it is not part of the batch and costs no time.
   - Take the rest until `--max-clusters`. Inside a taken cluster, a dispute that cannot be decided
     stays open with its reason; the others still get verdicts.
5. Create the ONE branch for the run (not in dry run):
   `git -C <BASE> switch -c judge/batch-<yyyymmdd-HHmm>`.

## Step 3 — Judge, cluster by cluster

For each cluster of the batch, in order, while the budget allows starting a new one:

1. Run `/kb-judge` on it with `--base <BASE>`, Steps 2–6 of its SKILL.md and `investigation.md`, on
   the run's branch (skip `/kb-judge`'s own `switch -c`; the branch already exists). The live
   checks go to the specialists as `/kb-judge` dispatches them; this session holds dossiers and
   verdicts, not page dumps.
2. **Per-cluster cap ~45 minutes.** Not converging → keep the observations already made, leave the
   unresolved disputes open with what was missing, and move on.
3. **A verdict covers only the clauses that were checked.** Split the entry into its clauses
   (`/kb-judge` Step 4.1); an amended claim rewrites only the clauses observed, and a clause that
   could not be checked keeps its old wording and is named in the `--why` as unchecked. When the
   dispute itself is about an unchecked clause, it gets no verdict — `open — <clause> not checked:
   <why>`. Never let a verdict on its neighbours close it.
4. Before committing, `git -C <BASE> diff` — every change explained by one of THIS cluster's
   verdicts; no `kb reindex`.
5. **Commit, one per cluster** — even when only `observe` items were written:
   `git -C <BASE> add -A && git -C <BASE> commit -m "judge: <KB-id> — <verdicts, e.g. 3x version-scoped>"`.
   A cluster that wrote nothing gets no commit and goes into the report as `no verdict: <reason>`.
6. **A cluster that fails** (a tool refuses, a write is half done, an error you cannot explain):
   discard its uncommitted changes with `git -C <BASE> reset --hard HEAD` AND
   `git -C <BASE> clean -fd` — a half-done split leaves new untracked entries that the next
   cluster's `add -A` would otherwise commit as its own. The clone is this run's own, and earlier
   clusters are already committed. Report it as `failed: <reason>` and go on to the next one.


## Step 4 — One PR for the batch

No commit on the branch → no PR; report `no verdict` and go to Step 5. Otherwise:

1. `npm run kb:sync-base -- --base <BASE>`. It prints `already contains … nothing to do` when `main`
   has not moved — then there is nothing to commit. Otherwise review what it staged and commit it as
   `judge: sync main`. **If it refuses** (an entry `main` changed beyond appended evidence, a
   conflict it will not resolve), push nothing: report `not opened: sync-base refused — <its
   message>` and keep the clone (Step 5).
2. `git -C <BASE> fetch origin`, then `git -C <BASE> diff origin/main...HEAD` — every change
   belongs to one cluster's commit or the sync. (The clone's local `main` is as old as the clone.)
3. `npm run kb:disputes -- list --base <BASE>` — the **after** counts.
4. Push the branch and open ONE PR against `main` of VirtoCommerce/vc-knowledge. Description, in
   English, readable without this session (`/kb-judge` Step 7 applies per cluster):
   - a table first: cluster · entries · verdict per dispute · commit sha — the reviewer's map;
   - one section per cluster with the clauses, the observations (stand, conditions, date), the
     sources and the oracles it touches;
   - per dispute, its class (`build` / `guest` / `signed-in`) and the stand it was decided on; a
     `build` verdict reached without re-observing the dispute's own stand says so in one line —
     it relaxes `/kb-judge` Step 4, and the reviewer must see where;
   - skipped and failed clusters, each with its reason;
   - open disputes before → after;
   - how to reject one cluster, copied from
     [`kb-judge-routine.md`](../knowledge/execution/kb-judge-routine.md) §Rejecting one cluster
     (revert, restore its `index.json` rows from `origin/main`, the split case, no `kb reindex`).

## Step 5 — Clean up and report

**Delete the clone only when nothing in it is still needed:** after the PR is open, or on `dry run`,
`skipped`, `queue empty` and `no verdict`. When the batch has commits that did not reach a PR — the
sync refused, the push or `gh pr create` failed, the run was cut short — **keep it** and put its path
and branch in the report: those commits are the batch's verdicts and exist nowhere else. A kept
clone stops every later run at the gate until the operator publishes or deletes it.

Delete the `RUNNING` lock (if this run wrote it) in every outcome.

Compare this repo's `git status --porcelain` with the start snapshot; any difference goes into the
report as a defect of this run. Then report to the operator, in Russian:

- outcome: `PR opened` / `dry run` / `skipped: <reason>` / `queue empty` / `no verdict: <reason>` /
  `not opened: <reason>` (with the kept clone's path and branch);
- the PR link, the batch size and the time spent;
- per cluster: entry ids, verdict per dispute (or why it stayed open), its commit; then the
  clusters skipped for credentials and those that failed, each with its reason;
- **to capture:** findings on other entries (entry or coordinate, stand, conditions, what was seen);
- anything written under `.vc-fix/vc-test/` in this repo;
- what this run created on each stand and whether it was deleted — anything left is listed with
  its stand and id; "nothing created" is said explicitly;
- every `BL-*` / `ECL-*` the verdicts contradict (for `/qa-review-oracles bl`);
- open disputes before → after.
