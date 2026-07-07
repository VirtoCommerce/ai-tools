---
applicability: reference
applicability_rationale: "Developers-team shared framework — write-tool discipline, single-repo + no-auto-merge + never-edit-tests rules, escalation, reporting. Universal across VC customers' vc-module-* and vc-frontend repos; the repo allowlist is data (ci/config/fix-repos.json)."
---

# Shared Developer Instructions — Virto Commerce Auto-Fix

Shared framework for the **developers team** — one developer + one reviewer **per repo kind**:
`fullstack-backend` + `backend-reviewer` (module/platform, .NET 10 / Angular) and `fullstack-frontend`
+ `frontend-reviewer` (vc-frontend, Vue 3 / TS). The developer implements the fix; the reviewer gates
the diff. These agents are the **interactive twins** of the headless CI fix agents
(`ci/agents/fix-triage-agent.md`, `fix-backend-agent.md`, `fix-frontend-agent.md`) and the `/qa-fix`
command is the interactive twin of `ci/run-fix-cycle.ts`. Both paths share the same infra and the same
gate ladder — never diverge from it.

## What this team is (and is not)
- **Is:** a small, write-capable developer team that fixes a single confirmed, simple, non-breaking
  bug in ONE VirtoCommerce product repo, proves it with a red→green test, and opens a **PR for human
  review** (never merged).
- **Is not:** the QA team. The QA agents (`agents/`) stay **read-only on GitHub**. Write
  scope (clone/branch/commit/push/PR) lives **only** here, isolated in `developers/`.

## Shared infra (reuse — do not reinvent)
| Concern | Source of truth |
|---------|-----------------|
| Gate ladder G0–G7 | `.claude/rules/quality-gates.md` |
| Module→repo routing, `isAllowedRepo`, `checkoutForFix`, build/test `REPO_PROFILES` | `ci/lib/repo-router.ts` |
| Live module dependency graph (Platform API) | `ci/lib/module-registry.ts` |
| Repo allowlist + routing hints | `ci/config/fix-repos.json` |
| VC module repo anatomy, .NET 10 / xUnit / Angular conventions | `knowledge/architecture/vc-module-architecture.md` |
| vc-frontend storefront anatomy, Vue 3 / TS / vitest / Storybook conventions | `knowledge/architecture/vc-frontend-architecture.md` |
| BL-* invariants / historical failures | `business-logic.md`, `vc-bug-catalog.md` |
| Workspace | `.fix-workspace/<repo>/` (gitignored) |
| Branch | `claude/qa-autofix/VCST-XXXX` |
| Output | `reports/fixes/FIX-*/` |

## Where the fix goes — ownership routing (client vs platform)
A deployment may be the native VirtoCommerce platform **or** a CLIENT project with its own custom
modules / theme / storefront fork. The routed repo's **ownership** decides where your PR (or, when
unfixable, an issue) goes. Ownership is **data, not guesswork**: `ci/lib/repo-router.ts` `repoOwnership(repo)`
returns `client` or `platform` from `project-profile.json` (written by `/project-init`); `contributionPlan(repo)`
returns `{ ownership, host, mode, forkOwner }`. **When no profile is present, every repo is `platform` /
GitHub / `direct` — i.e. the original VirtoCommerce-internal behaviour, unchanged.**

| Routed repo | Where the PR goes | How |
|-------------|-------------------|-----|
| **Client** repo (custom module / theme / storefront fork) | the **client** repo | push + PR on the client's host: GitHub (`gh pr create`) or **Azure Repos** (per `vcs.clientHost`) |
| **Platform** repo, operator = **virto-engineer** | **direct** PR to `VirtoCommerce/<repo>` | push the work branch to the repo, `gh pr create` on it (today's behaviour) |
| **Platform** repo, operator = **client** | **fork** PR to `VirtoCommerce/<repo>` | the fix branch lives on the client's fork (`upstream.clientGithubAccount`); PR head is `<forkOwner>:<branch>` |
| **Platform** bug that is **real but NOT fixable** (too-complex / multi-repo per Gate 0/1) | a **GitHub Issue** on `VirtoCommerce/<repo>` | not a PR — the client can't fix complex platform internals, so hand it upstream (client just needs a GitHub account) |

In the headless twin (`ci/run-fix-cycle.ts`) this routing is automatic (it calls `getVcs(ownership)` /
`getUpstreamVcs()` and a fork-aware `checkoutForFix`). **You** (interactive) must apply the same matrix by
hand: read `contributionPlan(routeRepo)`, then clone/branch/push/PR accordingly. The single-repo and
no-auto-merge hard rules below are unchanged in every case.

### Frontend provenance — a client storefront fork mixes client + platform code
When the routed repo is a **client `frontend` fork**, the *repo* is client-owned but an individual bug may
live in **unmodified vc-frontend code** carried into the fork. Don't decide from the symptom — decide from
the RCA anchor's **provenance** against the fork's upstream (`clientUpstream(repo)` → `{ upstream,
upstreamRef }`): fetch the anchor file from the client repo and from `vc-frontend @ upstreamRef`, then use
`classifyFrontendProvenance()` + `frontendDeliveryPlan()` (`ci/lib/provenance.ts`). Anchor client-only or
differing ⇒ fix + PR on the client repo; byte-identical to unmodified upstream ⇒ platform bug →
**contribute the fix upstream**: fork `vc-frontend`, fix, open a **fork-PR to VirtoCommerce** (the standard
§1a platform path — client-scrubbed, §2a; the client gets it via a later release + fork sync, we do NOT
patch the client fork with platform code). An upstream **Issue** instead is only for a Gate-0 too-complex /
multi-repo bail. Already fixed upstream ⇒ STOP-upgrade; uncomparable ⇒ STOP (containment-first). Full
table: `quality-gates.md` §1a Gate 1b.

### 🔒 Client-code containment — HARD security invariant (see quality-gates §2a)
**Client code MUST NEVER leave the client's project. Upstream VirtoCommerce gets contribution only —
platform code — NEVER client source, in any form.** This outranks fixing the bug: on any conflict, STOP.
- A `repoOwnership === "client"` repo is fixed **only** on the client's host (direct). **Never** fork /
  PR / file an issue for a client repo to `VirtoCommerce/*` or any public/external destination.
- A platform PR / fork / GitHub issue carries **only** platform code + platform-generic repro. **Scrub**
  the repro test, diff, PR/issue body, logs, and stack traces of every client source line, file path,
  identifier, datum, and secret before pushing/filing to `VirtoCommerce/*`. If the bug reproduces *only*
  with client code, it is **not** upstream-contributable → STOP and hand back to the client team.
- **One repo per run.** The `.fix-workspace/` for a platform contribution never contains a client repo
  (and vice-versa); never copy code between a client and a platform checkout.
- **Uncertain ownership ⇒ treat as client and STOP** (containment-first) — never open an upstream PR/issue
  on a maybe-client repo.

## GitHub authentication (the write token)
The ambient `gh`/`git` session on this host is logged in as the **read-only** GitHub MCP token — it
**cannot** push. All remote write operations (clone, push, PR) must run as the **dedicated write
token** `GITHUB_FIX_BUGS_TOKEN` from `.env.local` (gitignored), exposed to `gh`/`git` as `GH_TOKEN`
(`GH_TOKEN` takes precedence over the ambient `GITHUB_TOKEN`). This is the interactive mirror of CI's
`AUTOFIX_GITHUB_TOKEN → GH_TOKEN` (`.github/workflows/auto-fix.yml`); `ci/lib/repo-router.ts` stays
token-name-agnostic (it just consumes ambient `gh`), so only the env binding differs between twins.

Load the token once per shell command (it does not persist between Bash calls) and **never print it**:
```bash
FIX=$(grep '^GITHUB_FIX_BUGS_TOKEN=' .env.local | sed 's/^GITHUB_FIX_BUGS_TOKEN=//' | awk '{print $1}')
GH_TOKEN="$FIX" gh repo clone VirtoCommerce/<repo> ...          # clone  (gh honours GH_TOKEN)
GH_TOKEN="$FIX" git -c credential.helper='!gh auth git-credential' push -u origin claude/qa-autofix/VCST-XXXX
GH_TOKEN="$FIX" gh pr create ...                                # PR
```
The explicit `-c credential.helper='!gh auth git-credential'` on `git push` is **required**: this
host's default helper is the Windows credential manager, which would otherwise serve the wrong (read)
token. `gh` commands need only the `GH_TOKEN=` prefix.

### When `gh` is already logged in (browser login), or the host is Azure Repos
The `GH_TOKEN=` prefix above is specific to a host whose **ambient** `gh` is the read-only GitHub MCP
token. A client deployment configured by `/project-init` with `vcs.auth: "gh-cli"` instead runs
`gh auth login` (browser), so the **ambient** `gh`/`git` session already has write scope — in that case
**drop the `GH_TOKEN=` prefix and the explicit credential helper**; plain `gh`/`git` already authenticate
(`gh auth status` confirms). Only fall back to the token-prefix form when `gh auth status` shows a
read-only / wrong identity. Check `project-profile.json` → `vcs.auth` to know which you're on
(`gh-cli` = ambient login; `pat` = a token in `.env.local`).

For a **client repo on Azure Repos** (`vcs.clientHost: "azure-repos"`), GitHub auth doesn't apply: clone
with the Azure Git URL `https://dev.azure.com/<org>/<project>/_git/<repo>` and authenticate with
`ADO_PAT` (`.env.local`) or an `az login` session (`ADO_AUTH=az-login`) — **never a password**. Open the
PR with the Azure DevOps REST `POST …/_apis/git/repositories/<repo>/pullrequests` (the headless twin's
`AzureReposVcs` does exactly this). `gh pr create` is GitHub-only.

### Commit identity — author as the human, NOT a bot (CLA)
Commits **must be authored by the human who owns the write token** (the GitHub account behind
`GITHUB_FIX_BUGS_TOKEN` / CI's `AUTOFIX_GITHUB_TOKEN`), with **Claude as a `Co-Authored-By:` trailer** —
never the reverse. The VirtoCommerce org runs **CLA Assistant** on PRs: it blocks until every commit
**author** has signed the CLA. A commit authored by a bot identity (e.g. `Claude QA Auto-Fix
<noreply@anthropic.com>`, login `claude`) waits forever on an identity no human can sign for, stalling
the PR. (2026-06-08 incident: a backend auto-fix PR sat blocked until the commit was re-authored to the
human + force-pushed — `23c309b → 7056057` — at which point CLA re-evaluated → **signed/success**.)

Derive the author from the token owner so it generalizes across customers/forks (no hardcoded name) and
always maps to a CLA-signable account; set it **per-commit** (don't rely on ambient `git config`):
```bash
GH_LOGIN=$(GH_TOKEN="$FIX" gh api user --jq .login)
GH_NAME=$(GH_TOKEN="$FIX" gh api user --jq '.name // .login')
GH_UID=$(GH_TOKEN="$FIX" gh api user --jq .id)
git -c user.name="$GH_NAME" -c user.email="${GH_UID}+${GH_LOGIN}@users.noreply.github.com" \
  commit -m "fix(<scope>): <imperative summary> (VCST-XXXX)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```
The `${id}+${login}@users.noreply.github.com` email is GitHub's canonical per-account form, so CLA
Assistant resolves it to the signed account regardless of the env. Optional overrides
`FIX_COMMIT_NAME` / `FIX_COMMIT_EMAIL` (`.env.local`) win when set. If a fix produced commits before
this identity was applied, **re-author and force-push** (`git commit --amend --reset-author …` /
`git rebase --root --exec` for multiple) so CLA can re-evaluate.

### Ticket key format follows the tracker (not always `VCST-`)
The examples below say `VCST-XXXX`, but the **key format depends on the deployment's tracker**: a client
Jira uses its own prefix (`ABC-123`), and **Azure Boards work items are bare numeric ids** (`12345`, no
letter prefix). Use whatever key/id the tracker gave you verbatim — the branch (`claude/qa-autofix/<key>`),
commit reference, and PR title all take it as-is. For **cross-linking** into the tracker from a commit/PR:
Jira auto-links the bare key (`ABC-123`); Azure Boards links a work item via `AB#12345`. Don't assume a
`VCST-` prefix anywhere.

### PR title — Conventional Commits, ticket key as scope
The **PR title** follows `fix(<key>): <imperative summary of the bug>` — Conventional-Commits shaped,
with the **ticket key in the scope slot** (e.g. `fix(VCST-5210): guard NRE in GetModules when icon file is
missing`; for Azure Boards the bare id, `fix(12345): …`). This puts the ticket up front so reviewers and
the tracker link read at a glance while the title stays changelog/scope-tooling parseable (the org
squash-merges, so the PR title becomes the squashed commit subject). It is **distinct from the commit
message**, which keeps the code area as its scope and the key trailing (`fix(<scope>): <summary> (<key>)`).
This is the `gh pr create --title` value and the `PR_TITLE:` marker the agent emits.

## After the PR — verify CI, don't assume green (Gate 5)
**Opening the PR is not the finish line.** The run is not done until the PR's GitHub Actions checks are
green. The product repos run **two** PR jobs you must wait on (plus `license/cla`):

1. **The build/test/quality job** — `Theme CI / ci` (vc-frontend) or `Module CI / ci` (modules/platform):
   build, **unit tests** (`yarn test:coverage` + `yarn test:typing` on frontend; `vc-build Test` on
   backend), and the **SonarCloud quality gate** (`SonarCloud Code Analysis` / the `Quality Gate` step;
   backend also runs **Swagger validation** on PRs to `dev`).
2. **The autotest job** — `… / auto-tests`: the shared `pytest-tests.yml` running the
   **`graphql, restapi, e2e`** suites against a real/deployed instance (frontend PRs to `dev` also
   auto-deploy to the `qa` environment first). This is the live-behavior check — it can catch a
   regression a unit test won't.

Poll until both resolve (re-poll on an interval; don't block-sleep), then act:
```bash
GH_TOKEN="$FIX" gh pr checks <pr-url-or-branch>             # status of every check
GH_TOKEN="$FIX" gh pr view <pr> --json statusCheckRollup    # machine-readable rollup
```
(Interactive `/qa-fix` owns this poll directly; in headless CI the orchestrator `ci/run-fix-cycle.ts`
polls and hands a red back to you — either way the analyze-and-fix loop below is yours. Note: **Storybook
CI does NOT run on PRs** — it's push-only — so don't wait on it.)

- **All green + `mergeable`** → done. Capture the one-line pass results in the PR body. Never merge.
- **Any check RED → fetch and READ the logs before touching anything.** Don't guess from the check name:
  ```bash
  GH_TOKEN="$FIX" gh run view <run-id> --log-failed          # only the failing steps' logs
  GH_TOKEN="$FIX" gh run view --job <job-id> --log           # full log of a specific job
  ```
  For the Sonar gate, read the PR's SonarCloud check annotations; for `auto-tests`, read the failing
  pytest case name + assertion in the job log. **Classify the reason, then act:**
  | Red reason | Action |
  |------------|--------|
  | Build / compile error (incl. a new `vue-tsc` warning, or a C# warning under `TreatWarningsAsErrors`) | Fix at the source within the minimal diff; never suppress the warning or disable the rule |
  | A **new** test you added fails on CI but passed locally | Investigate the env difference (timezone, locale, ordering, async settle); fix your test/code, never weaken the assertion |
  | A **pre-existing** unit test went red | Contract conflict → **STOP**, do NOT edit the existing test, report (human decision) |
  | `auto-tests` (graphql/restapi/e2e) red **on an area your fix touches** | A real regression — read the failing case, fix the root cause, re-push |
  | `auto-tests` red **on an unrelated area / known-flaky / env data** | Re-run the job once; if it still fails unrelated to your change, it's pre-existing/infra → note it in the PR and escalate, don't contort the fix |
  | Lint / format / locale / a11y / Swagger-validation check | Fix in your changed lines; never edit the CI/lint config to pass |
  | SonarCloud QG red on **changed** lines (real bug / vuln / unreviewed hotspot, or missing new-code coverage) | Fix the valid finding / add coverage within minimal-diff + never-edit-existing-tests |
  | SonarCloud QG red on **pre-existing** debt unrelated to the diff | Don't chase it — mark won't-fix in Sonar or note it in the PR; not your scope |
  | Infra / flake (runner timeout, transient network, queue, env provisioning) | Re-run once; if it recurs it's infra → escalate, don't loop |
- **Self-correct in the SAME repo, re-push, re-poll — at most 2 iterations.** Each push re-triggers CI;
  wait for the new run, don't assume the fix worked. Persistent RED, a cross-repo cause surfaced by the
  logs, or a repo-owned QG threshold → **STOP + report** (`FIX_STATUS: FAILED` with the reason quoted
  from the logs); do not keep pushing. **Never** merge to make a check pass.

## Hard rules (a violation = STOP, never "push anyway")
1. **Single repo.** All changed files in ONE allowed repo. Cross-module / second repo → STOP (report
   `ROOT_CAUSE: belongs in <dep>`); cross-module needs human version-bump coordination.
2. **Never modify or delete an existing test** — only ADD. An existing test going red after the fix =
   contract conflict → STOP, do not edit the test.
3. **Minimal diff.** No refactors, no nuget/dep bumps, no formatting churn, no unrelated files.
4. **No breaking changes.** No public REST/GraphQL/DTO/contract change, DB schema/migration, domain
   event shape, or `module.manifest` change. Any of these → STOP (Gate 0 boundary).
5. **No secrets.** Never read, echo, or commit credentials/connection strings/`.env*`/`*.Development.json`.
   The GitHub PAT stays in the env used by `gh`/`git`; never print it.
6. **No auto-merge.** Forbidden: `mcp__github__merge_pull_request`, `gh pr merge`. PRs are opened for
   human review and never merged (interactive: a normal PR via `gh pr create`; CI: `--draft`).
7. **Preserve BL-* invariants.** A fix that passes the STR but breaks a `BL-*` rule is a regression.

## Escalation triggers (STOP + report, don't loop)
- Root cause spans 2+ repos, or lives in a NuGet dependency.
- No test harness in the module (don't scaffold a risky one).
- Fix requires a migration / schema / contract change.
- CI infra failure (not a code failure) — don't retry in a loop.
- Ambiguous "expected result", security disclosure, or low confidence after ≤2 revise iterations.

When you STOP on a **platform** repo for *too-complex* or *multi-repo* (not a by-design rejection), say so
explicitly in your report — on a client deployment the orchestrator turns that into a **GitHub Issue on
the VirtoCommerce upstream** (the client can't fix platform internals, so it's handed upstream for a
human). You do **not** file the issue yourself; just report the class so the orchestrator can.

## Reporting discipline
- Long transcripts / investigation logs go via SendMessage to the orchestrator (or the `reports/fixes/FIX-*/`
  per-ticket transcript), **never** as standalone files in the repo (per `.claude/rules/reports.md`).
- End with the marker block your role defines (the developer — `fullstack-backend` / `fullstack-frontend`:
  `FIX_STATUS`/`PR_TITLE`/`PR_URL`/`CONFIDENCE`/`ROOT_CAUSE`; the reviewer — `backend-reviewer` /
  `frontend-reviewer`: `REVIEW: APPROVE|REQUEST_CHANGES` + reasons + `CONFIDENCE`).
- Real-user / browser rules do **not** apply here — this team writes code; it does not drive browsers.
  E2E verification (Gate 6) is delegated back to `qa-backend-expert` (module/platform) or
  `qa-frontend-expert` (vc-frontend) via `/qa-regression`.
