# `/kb-judge-routine` — the gate, the credentials and the rejection recipe

Read by [`/kb-judge-routine`](../../commands/kb-judge-routine.md) at the step that cites each
section. The command holds the order of the run; this file holds the commands and rules each step
needs, so the command stays inside its body budget.

## Gate

Run the gate in **PowerShell**: the work folder is `$env:TEMP/kb-judge` (never `%TEMP%`, which
neither PowerShell nor Git Bash expands, and which would create a folder of that name in the repo).

```powershell
$work = Join-Path $env:TEMP 'kb-judge'
Get-Date -Format o                                   # the start time the budget is measured from
$lock = Join-Path $work 'RUNNING'
if (Test-Path $lock) { (Get-Item $lock).LastWriteTime } # younger than 6 h → skipped; older → stale
Get-ChildItem $work -Directory -ErrorAction SilentlyContinue |
  ForEach-Object { Join-Path $_.FullName 'vc-knowledge' } | Where-Object { Test-Path $_ }
```

**Another run is open** when any of these holds:

- **An open PR from a `judge/*` branch.**
  `gh pr list -R VirtoCommerce/vc-knowledge --state open --json number,headRefName,url --limit 100`.
  Report its URL and whether review comments are waiting: the operator acts on them, not the routine.
- **A `judge/*` branch with no PR at all, open or closed.** This is a run, or a manual `/kb-judge`,
  that pushed and never opened its PR. Check each branch on its own. A page-limited list of all PRs
  misses old ones and then reads every merged branch as unpublished.

  ```powershell
  gh api repos/VirtoCommerce/vc-knowledge/branches --paginate --jq '.[].name | select(startswith("judge/"))' |
    ForEach-Object { if ((gh pr list -R VirtoCommerce/vc-knowledge --state all --head $_ --json number --jq 'length') -eq '0') { $_ } }
  ```

- **A `RUNNING` lock younger than 6 hours.** A run is in progress. An older lock is stale: report it,
  delete it, and go on.
- **A leftover clone with unpublished commits.** A kept clone holds verdicts only if it has commits
  that no remote branch carries: `git -C "<clone>" log --branches --not --remotes --oneline` is not
  empty. Then the gate stops and reports the clone's path. If the command prints nothing, the clone
  holds nothing: it is a crash leftover, or Windows refused to delete read-only `.git` packs. Delete
  it (`Remove-Item -Recurse -Force`), name it in the report, and go on.

When the gate passes, write the lock: `New-Item -Force (Join-Path $work 'RUNNING') -Value (Get-Date -Format o)`.

## Credentials and reachability

Test-user and admin passwords live in vc-secrets. `ADMIN_PASSWORD` is absent from every `.env` layer
**by design**. Its absence is never a blocker, and never a reason to skip a dispute or leave it open.
When `/preflight` reports `ADMIN_PASSWORD` missing or an admin token refused, note it and carry on:
that check reads `.env`, which vc-secrets never writes.

**A lane signs in to ONE stand: the `TEST_ENV` this session started with.** Each lane gets the
passwords of the env that was current when its server started (`plugins/vc-init/bridge/run.mjs`).
Typing `ADMIN_PASSWORD` on any other stand types the wrong password, so on every other stand the run
is a guest, whatever vc-secrets holds for it.

- **Signing in.** Use a Playwright lane (`playwright-edge` for `qa-backend-expert`) and type the bare
  NAME `ADMIN_PASSWORD` into the password field ([`../../rules/vc-browser.md`](../../rules/vc-browser.md)).
  REST checks that need an admin session go through that lane, never through a token minted from `.env`.
- **The deployed build of the session's stand.** Run
  `node "$VC_RUN" runner plugin deployed --key KBJUDGE-<yyyymmdd>`. It writes the gitignored
  `.vc-fix/vc-test/<key>/<env>/deployed.json`. This is the one write into this repo the routine
  allows, and the report names it. A side it reports UNKNOWN stays unknown, never "not deployed".
  When the command refuses (e.g. `profile has no test block`), read modules through the admin lane
  (`GET /api/platform/modules`), and say which path gave each number.
- **Any other stand, as a guest.** The platform version is on the Admin SPA's root page
  (`ng-init="platformVersion='…'"` at that stand's `BACK_URL`). The theme version is in the
  storefront's entry bundle at its `FRONT_URL`. Both are anonymous, the same reads `deployed.mjs`
  makes. Module versions need an admin login, so they stay `unknown` there. Never infer them.
- **A role with no password on the session's stand** (`node "$VC_SECRETS" doctor` lists what
  resolves). Its disputes stay `open — no credentials for <role> on <stand>`. Never borrow another
  role's password, or another stand's.

## Who writes to the kb during a batch

The specialists **report and never write**: no `kb_capture`, `kb_confirm` or `kb_dispute`
(`/kb-judge` `investigation.md` §3). Every dispatch brief says so. The batch is one session, and a
specialist's confirm on an entry of a later cluster makes that cluster's `observe` and `resolve`
refuse. The routine itself writes only through `kb:disputes observe` / `resolve` on the batch's
entries. It never runs `npm run kb -- push`, which lands this machine's queue straight on the base's
`main`. A finding about any OTHER entry goes into the report as **to capture** (entry or coordinate,
stand, conditions, what was seen), and the operator records it after the PR.

## Rejecting one cluster of a batch PR

1. Revert the cluster's commit on the branch.
2. `index.json` conflicts, because every cluster rewrote rows of it. Resolve the conflict by
   restoring that cluster's rows from `origin/main`'s `index.json`, which is what the base held before
   the judgement, and keep every other row.
3. **If the cluster made a split,** the revert deletes the child entry files. Delete their index
   rows too, and restore the parent's row from `origin/main`.
4. Never run `kb reindex` on the branch: `/kb-judge` Step 6.4 forbids it. The other clusters stand.
