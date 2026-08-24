---
name: qa-hotfix-check
description: "[QA Methodology] DELIVER an already-released hotfix onto the deployed vcptcore-stable + vcptcore-regression environments (bump the module/Platform version in vc-deploy-dev's backend/packages.json, commit \"VCST-XXXX: title\"), WAIT for the deploy to land (deploy Action green → /api/platform/modules reports the new version), VERIFY the fix works live, comment on the JIRA task, transition the per-env subtasks (Check on regression/stable) + the parent to Done (live transition discovery, never Cancelled), bump the frozen stable + `latest` bundles (auto-detect + ASK), and self-diagnose the run (OK/DEGRADED/BROKEN per stage). Use when asked to 'доставить хотфикс на стенды / проверить хотфикс на средах / раскатить фикс на stable+regression'. Downstream of /qa-hotfix; delivery-only (never cuts a release). Gated writes, never auto-merges."
argument-hint: "VCST-XXXX [--envs=stable,regression] [--bundles=v14,v15] [--dry-run]"
---

# Deliver & Verify a Hotfix on the stable + regression Environments

`/qa-hotfix` **produces** a patch release on a `support/<X.Y>` line. That release does **not** reach
the running QA environments by itself — the `vcptcore-stable` and `vcptcore-regression` instances are
provisioned from **`vc-deploy-dev`'s `backend/packages.json`** (one branch per env), and a module only
redeploys when its pinned version there is bumped. This skill **delivers** the released hotfix onto
those two environments, **waits** for the deploy to land, **verifies** the fix live, records the result
on the JIRA task, and then **bumps the latest-stable bundles**.

> Twin lineage: [`/qa-bundle-check`](../qa-bundle-check/SKILL.md) **detects** a missing hotfix →
> [`/qa-hotfix`](../qa-hotfix/SKILL.md) **produces** the patch release → **`/qa-hotfix-check` delivers
> it to the environments + verifies + bumps the bundles.** All three share `config/module-repo-map.json`,
> the `GIT_TOKEN` auth model, and the same-line (`X.Y.(Z+n)`) semantics.

**Scope: delivery + verification only.** The hotfix must already be **released** (a real `X.Y.Z` tag
whose release contains the fix). If it isn't, this skill **STOPs** and hands you back to `/qa-hotfix` —
it never cuts a release.

## How the environments are wired (verified 2026-07-17)

- Each env = a branch of `VirtoCommerce/vc-deploy-dev`: `vcptcore-stable`, `vcptcore-regression`. The
  deploy coords live in the env files (read, never hardcoded): `DEPLOY_REPO` / `DEPLOY_BRANCH` /
  `DEPLOY_PACKAGES_PATH` in [`.env.vcptcore_stable`](../../../.env.vcptcore_stable) and
  [`.env.vcptcore_regression`](../../../.env.vcptcore_regression).
- `backend/packages.json` structure: `PlatformVersion` + `PlatformImageTag` (Platform ships as a Docker
  image tag), then `Sources[]` — an `AzureBlob` source (prerelease/alpha blobs) and a `GithubReleases`
  source listing modules as `{Id, Version}`. A **module** hotfix bumps the `{Id, Version}` entry; a
  **Platform** hotfix bumps both `PlatformVersion` and `PlatformImageTag`.
- **A push to the env branch triggers the "Cloud platform deployment" Action** (`deploy-backend.yml`).
  The recurring commit convention IS `VCST-XXXX: <title>` (confirmed against the branch's history).
- **The ping — "did the env actually update?"** `<BACK_URL>/api/platform/modules` reports each installed
  module's live version. Because a hotfix is a real release tag (not a prerelease), the version bumps
  cleanly, so **version-match is a reliable "it restarted on the hotfix" signal**. Two phases:
  (1) the deploy Action reaches `success`, then (2) the modules API reports the target version.
- **Rollback trap** (`reference-deploy-manifest-module-resolution`): `GithubReleases` downloads
  `releases/download/<Version>/<Id>_<Version>.zip` **directly** — if that release has no downloadable
  asset the Pack step 404s and the platform **rolls back the whole InstallModules step**. So the target
  release must exist **with a `.zip` asset** before we ever commit.

## Why a deterministic script (+ a thin agent layer)

Resolving "task → PR → fix commit → released patch on the env's line", editing the manifest, dispatching
via a push, and polling two endpoints is mechanical. So:

- **`scripts/hotfix/hotfix-deliver.ts`** owns steps 1–3 below: resolve, the gated `packages.json` commit, the
  deploy-Action poll, and the live module-version poll. **Read-only by default** (dry-run); `--apply`
  performs the gated write.
- The **agent/orchestrator** owns the judgment: confirm each write, run the live **fix-behaviour**
  verification, comment on JIRA, and pick + confirm the **bundle** bumps.

`GIT_TOKEN` (a PAT with `contents:write` on vc-deploy-dev + `actions:read` + product-repo read) is read
from `.env.local`. The live version check needs the env's admin credentials (per-env `ADMIN_PASSWORD_*`
in `.env.local`, else the `Password1` convention).

---

## Step 1 — dry-run: resolve + plan (read-only, no writes)

```bash
npm run hotfix:deliver -- VCST-XXXX --envs=stable,regression         # dry-run (default)
# overrides: --repo=<name> | --pr=<owner/repo#N|url> | --version=<X.Y.Z>
```

Per env the script prints: the module's **pinned** version + its line `X.Y`, the resolved **target**
(the highest `X.Y.*` release that contains the fix — cherry-pick aware), the asset gate, and exactly
what it would commit. Read the verdicts:

| Verdict | Meaning | Action |
|---|---|---|
| `📝 planned` | a released hotfix on the line is ready to deliver | proceed to Step 2 (with `--apply`) |
| `◯ already delivered` | the env is already pinned at / above a version containing the fix | nothing to do on this env |
| `⛔ no hotfix on line` | no patch above the pinned one on this env's line contains the fix | **STOP** → run `/qa-hotfix` for this bundle/line first, then re-run |
| `⛔ asset missing` | the target release has no downloadable `.zip` (rollback trap) | **STOP** → publish/repair the release asset first |
| `— not in manifest` | the module isn't pinned on this env | nothing to hotfix there |

The two envs are frequently on **different lines** (e.g. stable on an older generation than regression),
so the resolved target — and whether there's anything to do — is **per env**. A `⛔`/STOP on one env does
not block the other.

## Step 2 — deliver (gated write, confirm before `--apply`)

Only for `planned` envs, and only after you've shown the user the per-env plan and they confirm. The
triple-guarded no-auto-merge culture applies ([`.claude/rules/quality-gates.md`](../../rules/quality-gates.md)).

```bash
# module hotfix
npm run hotfix:deliver -- VCST-XXXX --envs=stable,regression --apply

# PLATFORM hotfix — pass the fix's own behavioural signal (see the rollover gate below)
npm run hotfix:deliver -- VCST-XXXX --envs=stable,regression --apply   --probe='POST /api/platform/security/login' --probe-body='{}' --probe-expect=400
```

With `--apply` the script, **per env**: bumps the version in `packages.json` → commits
`VCST-XXXX: <title>` to the env branch via the GitHub Contents API (this push is what triggers the
deploy) → polls the **"Cloud platform deployment"** Action (matched by the commit's `head_sha`) to
`success` → confirms the env is actually serving the hotfix (module → version match; **Platform →
the `--probe` behavioural gate**).

### The rollover gate — a green deploy does NOT mean the fix is live (Platform)

**Verified the hard way on VCST-5623, 2026-08-18.** The `vcptcore-*` envs are Azure apps fed by an
image the deploy builds; **the app keeps serving the PREVIOUS revision for roughly 1-2 minutes after
the deploy Action turns green.** A probe run ~1 min after a green regression deploy still returned the
**pre-fix** `500`s; the same probe 3 min later returned the fixed `400`. On stable the rollover took
**~50 s**.

This is a trap specifically for **Platform** hotfixes, because there is nothing to assert a version
against — no Platform entry in `/api/platform/modules`, and `/api/platform/version` is **404** — so the
old confirmation was *deploy green + `/health` 200*, and **both are satisfied by the old container**.
That combination reported `✅ delivered` while the fix was not yet serving. Two consequences, both bad:
a verification run started immediately reads as a **behavioural FAIL on a correctly delivered hotfix**
(inviting a pointless re-delivery or a suspicion of the release), and a run that *skips* verification
reports a pass that was never proven.

So for a Platform hotfix, **give the script the fix's own observable signal** — only the caller knows
what the fix changed:

| Flag | Meaning |
|---|---|
| `--probe='<METHOD> /path'` | anonymous request polled until it returns the expected status |
| `--probe-body='<raw>'` | request body, sent as `application/json` |
| `--probe-expect=<status>` | the status that proves the new build is serving (e.g. `400`) |

Pick a signal that **differs between the old and new build** (here: the payload that used to 500 and
must now 400). A signal both builds return is worthless as a gate. `--probe` and `--probe-expect` must
be given together; the probe is deliberately anonymous, so liveness never depends on an admin token.
`--probe-body` with `GET`/`HEAD` is rejected up front (`fetch` refuses a body there, and the probe loop
would otherwise read that as "no response" and blame the environment for a typo).

A **module** hotfix may also take `--probe`: the version match proves the module reinstalled, the probe
proves the behaviour changed, and both must pass. Passing it is optional there (the version match is
already a sound liveness signal) but never ignored.

`--timeout` is the **shared** per-env budget: deploy-Action wait, `/health` and the liveness gate all
draw from the same deadline (health takes at most a 5-minute slice of it), so a stuck env cannot exceed
what you asked for.

**Without `--probe` a Platform delivery now reports `⚠ deployed, fix NOT confirmed live`
(`deployed-unverified`) — never `✅ delivered`.** That is not a failure (the commit and deploy did
succeed, so it doesn't abort the remaining envs or fail the exit code); it is the script refusing to
claim something it cannot see. You still owe the behavioural proof in Step 3.

- `--no-wait` commits but skips the polling (when you want to verify the deploy out-of-band). This
  reports `⚠ committed, deploy/version NOT confirmed` — never `✅ delivered` — since neither check ran;
  confirm the deploy + version by hand before treating that env as delivered (Step 3/4 wait for it).
- `--timeout=<sec>` per-env budget for deploy + restart (default 1200).
- Deliver envs **one at a time** unless the user explicitly wants both at once — a stable regression on
  the first env is a reason to pause before touching the second.

Verdicts after `--apply`: `✅ delivered` (deploy green **and** the hotfix proven live — module version
match, or the `--probe` gate returned `--probe-expect`) · `⚠ deployed, fix NOT confirmed live`
(Platform with no `--probe`: deployed, liveness unproven — Step 3 still owes the proof) · `⚠ deployed,
version not confirmed` (the modules API never reported the version, or `--probe` never returned its
expected status within the timeout — investigate, don't assume) · `⚠ committed, deploy/version NOT
confirmed` (`--no-wait` — confirm out-of-band before proceeding) · `⛔ deploy failed` (read the Action
logs, classify, fix root cause or escalate — never loop blindly).

**Platform hotfixes:** `/api/platform/modules` carries no Platform-core version, so a Platform delivery
confirms on the **`--probe` behavioural gate** (deploy Action + `/health` are necessary but prove only
that *an* app is answering — see the rollover gate above). Without a probe, say the limitation out loud
rather than implying a confirmed pass.

## Step 3 — verify the fix behaves on the live env (the "и всё работает" step)

Delivery ≠ fixed. After each `✅ delivered` env, run the **targeted repro of the task** on that live
environment (the `/qa-verify-fix` methodology): reproduce the STR from the bug/PR against `BACK_URL` /
`FRONT_URL`, confirm the symptom is gone, and capture minimal evidence. Delegate to the right expert:

- backend / module / GraphQL / Admin SPA → **qa-backend-expert**
- storefront-visible behaviour → **qa-frontend-expert**

**Never conclude from a single probe taken right after the deploy** — that is the rollover trap above,
and it manufactures a false FAIL. Poll the fix's signal until it flips, with a bounded ceiling
(~10 min); only a **timeout** is a real STOP:

```bash
until [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BACK_URL/api/platform/security/login"   -H 'Content-Type: application/json' -d '{}')" = 400 ]; do sleep 10; done
```

(When Step 2 ran with `--probe`, this gate already passed there — Step 3 then confirms the *full* case
set rather than re-proving liveness.) Verify the fixed cases **and** paired controls: payloads that
should be **unchanged** by the fix, plus the normal happy path (a valid login), so a "fix" that broke
something adjacent cannot read as a pass.

A single flaky rerun is fine; a persistent failure **after the signal has demonstrably flipped** is a
**STOP** → report, do not comment "verified". (Optional deeper net: `/qa-regression <module-group>` for the
affected module from `module-suite-map.md`.)

## Step 4 — record on the JIRA task (English)

Once **every targeted env** is delivered **and** the fix is verified live, comment on the task (English
per `feedback-jira-comments-in-english`; markdown, not wiki, per `reference-jira-comment-markdown-not-wiki`; clear/brief/outcome-first per `knowledge/execution/tracker-ops.md` §5a **Comment & body style**):
the per-env table (env · branch · pinned→target · deploy run link) and one line — *"Hotfix verified on
stable + regression."* If verification was **provider-limited / inconclusive** (Step 3), say so plainly
(delivered + no-regression, definitive proof pending) — never claim a clean pass. If an env STOPped, say
which and why.

## Step 5 — transition the tracker to Done (subtasks + parent)

VCST hotfix-check tasks carry per-env **subtasks** ("Check on regression", "Check on stable"). Once the
matching env is delivered + verified (Step 3) and the comment is posted (Step 4), transition each such
subtask to **Done**, then the **parent** task to Done — via the Atlassian MCP.

**Discover transitions live — the workflow is multi-hop and has a Done-lookalike trap** (verified 2026-07-17,
see `reference-vcst-hotfix-workflow-transitions`). There is **no** single-hop "Done" from the starting
status; walk `getTransitionsForJiraIssue` → `transitionJiraIssue` one step at a time, re-querying after
each hop, until the status is **`name: "Done"`** (`statusCategory.key === "done"`):

- **Subtask** (`To Do`): `Take to development` → `In progress` → `go to done` → **Done**.
- **Parent Bug** (`Hotfix ready`): `check hotfix` → `Testing on stable` → `Move to done` → **Done**.

**Never pick `Cancelled`** — it is *also* `statusCategory.key === "done"` (green) but is the wrong terminal.
Select by target-status **name** = `Done` (or the transition that advances toward it), never by category
alone; also skip `On hold` (backwards). IDs drift per project — resolve by name at runtime, don't hardcode.

**Guard — only close on a genuine pass.** Transition to Done only when the env delivery succeeded AND the
behaviour check did not actively FAIL. `provider-limited / inconclusive` + no-regression is closeable (the
env-check subtasks are literally "did we check this env" — we did), but a **failed** delivery or a
**behavioural FAIL** is a STOP: leave the tracker where it is and report. Map subtasks to envs by summary
("regression" / "stable"); close only the subtasks whose env was actually delivered this run.

## Step 6 — bump the bundles (frozen stable **and** `latest`) — auto-detect + confirm

The env delivery proves the hotfix is deployable; the **bundles** (`vc-modules/bundles/*`) are the
shipped release artifacts and must pick the patch up too. Two kinds, both proposed here:

- **Frozen stable bundles** (`bundles/vN` — e.g. `v14`, `v15`): a fixed generation, bumped along its
  own same-line hotfix.
- **The rolling `latest` bundle** (`bundles/latest`): tracks the **newest** generation. It needs the
  hotfix **only when it trails on the same line** — i.e. the fix landed on the newest line. A hotfix on
  an **older** frozen line (e.g. a `v14`/3.1007 patch while `latest` is on 3.1039) leaves `latest`
  untouched (`bundle:check` returns `✓ current` for it). So `latest` is a **conditional** candidate:
  propose a PR for it **iff** detection shows it trailing.

Auto-detect the candidates, then confirm before writing:

1. Run detection over the frozen stable bundles **and** `latest`:
   ```bash
   npm run bundle:check -- v14        # each frozen stable bundle
   npm run bundle:check -- v15
   npm run bundle:check -- latest     # the rolling newest-generation bundle
   ```
   (`/qa-bundle-check` flags `⬆ HOTFIX AVAILABLE` when a bundle trails its line, `✓ current` otherwise.)
2. **Show the user every candidate that trails — frozen stable bundles AND `latest` — and ask for
   confirmation.** The stable set changes over generations (v14/v15 today; do not hardcode). Accept
   whatever they confirm/override with `--bundles=`. If `latest` trails, offer it explicitly as its own
   proposal (it is easy to forget — a fix not absorbed into `latest` regresses on the next generation cut).
3. For each confirmed bundle (frozen **or** `latest`), bump its pinned version to the hotfix (surgical
   commit — a targeted `"Id": "VirtoCommerce.X" … "Version"`, or `PlatformVersion`/`PlatformImageTag`,
   replace that changes ONLY those lines, preserving the rest of `package.json`), on a branch, opened as
   a **PR to `master`** with a `DO NOT MERGE until human review` body. **Never auto-merge** the bundle
   PR. (`latest` may ride in the same PR as the frozen-stable bumps, or its own — the point is it is
   never silently skipped.)

## Step 7 — self-diagnose the run (self-check)

Close every run with a short **self-check** — a completeness critic over this skill's own execution, so a
silent degradation is surfaced instead of read as success. For each stage, emit a one-line
**OK / DEGRADED / BROKEN** verdict with evidence:

| Stage | OK means | DEGRADED / BROKEN signal |
|-------|----------|--------------------------|
| Deliver | every targeted env `✅ delivered` (version match, or the `--probe` gate passed) | `⚠ deployed-unverified` (Platform, no `--probe` — liveness never proven) = DEGRADED; `⚠ not-confirmed` (version/probe never reached its target) = DEGRADED; `⛔ deploy-failed` / `asset-missing` = BROKEN |
| Verify | behavioural proof obtained **after** the rollover, fixed cases + controls + happy path | `provider-limited / inconclusive` = DEGRADED (say why — e.g. ES-backed env can't prove an Azure bug); behavioural FAIL = BROKEN. A FAIL measured before the rollover is **not** a finding — re-poll first |
| JIRA comment | posted, honest about any provider limit | missing / overclaims a limited pass = DEGRADED |
| Transition | subtasks + parent reached `Done` (not `Cancelled`) | stuck mid-workflow / closed on a non-pass = DEGRADED |
| Bundles | PR opened for each confirmed bundle | candidate detected but not PR'd, or bundle skipped silently = DEGRADED |

State the DEGRADED items as explicit follow-ups (e.g. "Azure behavioural proof still owed on an
Azure-backed env"), never bury them. For a deeper, plugin-wide self-diagnosis (reads session telemetry +
the skill-expectations oracle, writes a local `DIAG-*.md`, sends nothing externally), defer to the
[`/vc-self-check`](../vc-self-check/SKILL.md) skill — this Step 7 is the lightweight in-skill version of that discipline.

## Hard rules (STOP/BAIL is a success)

- **Delivery-only.** If the hotfix isn't released on the env's line (`⛔ no hotfix on line`), STOP →
  `/qa-hotfix` first. Never cut a release from here.
- **Never write without confirmation.** Dry-run is the default; `--apply` only after the user confirms
  the per-env plan. `merge_pull_request` / `gh pr merge` stay denied.
- **Asset gate before every commit.** No downloadable release asset ⇒ the deploy would roll back ⇒ STOP.
- **Confirm the env actually restarted.** A green deploy Action is necessary but not sufficient — require
  the `/api/platform/modules` version match (module hotfix) or the **`--probe` behavioural gate**
  (Platform) before "delivered". **`/health` 200 is NOT that proof**: it is answered by the previous
  revision for ~1-2 min after the deploy, so it cannot distinguish the new build from the old one.
- **Never report a Platform hotfix verified off a single post-deploy probe.** Poll until the fix's own
  signal flips (bounded); a `⚠ deployed, fix NOT confirmed live` verdict is an honest state to report,
  an unproven `✅` is not.
- **One env at a time by default**; a failure on the first pauses the second.
- **Don't guess bundles.** Auto-detect, then ask. The latest-stable set drifts.
- **Only close the tracker on a genuine pass.** Transition subtasks + parent to Done only when the env was
  delivered and the behaviour check didn't FAIL (provider-limited is closeable). Resolve transitions by
  status **name** at runtime and **never pick `Cancelled`** (a Done-category lookalike).
- **Always self-check (Step 7).** End with the OK/DEGRADED/BROKEN self-diagnosis; surface every DEGRADED
  item as an explicit follow-up rather than letting it read as a clean pass.
- **If anything looks like it could break — stop and involve a developer** (the `/qa-hotfix` golden rule
  carries over).

## Reporting

Tooling output, not one of the five tracked report categories ([`.claude/rules/reports.md`](../../rules/reports.md))
— print the per-env table + delivered versions to the user and the JIRA comment; do **not** create a
file under `reports/`. A delivery that changes a release decision flows into the normal release report.

## Maintenance

- Deploy coords are per-env in `.env.vcptcore_stable` / `.env.vcptcore_regression` (`DEPLOY_*`). A new
  env just needs its own `.env.vcptcore_<env>` with those vars + `BACK_URL`.
- The deploy Action is matched by name ("Cloud platform deployment") **and** file (`deploy-backend.yml`)
  **and** the commit `head_sha`; a rename on any one still matches via the others.
- `config/module-repo-map.json` (shared with `bundle:check` / `hotfix:precheck`) maps repo → manifest
  module Id and self-heals for new modules.
- Tag/line scheme assumed: bare `Major.Minor.Patch`. Adjust `parseSemVer` / `highestOnLine` in
  `scripts/hotfix/hotfix-deliver.ts` if a repo diverges.
