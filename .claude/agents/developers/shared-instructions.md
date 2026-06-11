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
- **Is not:** the QA team. The QA agents (`.claude/agents/qa/`) stay **read-only on GitHub**. Write
  scope (clone/branch/commit/push/PR) lives **only** here, isolated in `developers/`.

## Shared infra (reuse — do not reinvent)
| Concern | Source of truth |
|---------|-----------------|
| Gate ladder G0–G7 | `.claude/rules/quality-gates.md` |
| Module→repo routing, `isAllowedRepo`, `checkoutForFix`, build/test `REPO_PROFILES` | `ci/lib/repo-router.ts` |
| Live module dependency graph (Platform API) | `ci/lib/module-registry.ts` |
| Repo allowlist + routing hints | `ci/config/fix-repos.json` |
| VC module repo anatomy, .NET 10 / xUnit / Angular conventions | `.claude/agents/knowledge/vc-module-architecture.md` |
| vc-frontend storefront anatomy, Vue 3 / TS / vitest / Storybook conventions | `.claude/agents/knowledge/vc-frontend-architecture.md` |
| BL-* invariants / historical failures | `business-logic.md`, `vc-bug-catalog.md` |
| Workspace | `.fix-workspace/<repo>/` (gitignored) |
| Branch | `claude/qa-autofix/VCST-XXXX` |
| Output | `reports/fixes/FIX-*/` |

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

### PR title — lead with the JIRA key
The **PR title** follows `VCST-XXXX: Fix <imperative summary of the bug>` (JIRA key first, then a short
human summary — e.g. `VCST-5210: Fix NRE in GetModules when icon file is missing`). This is the
`gh pr create --title` value and the `PR_TITLE:` marker the agent emits. It is **distinct from the commit
message**, which stays Conventional Commits (`fix(<scope>): <summary> (VCST-XXXX)`): the commit feeds
changelog/scope tooling, while the PR title leads with the ticket so reviewers and the JIRA link read at
a glance.

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

## Reporting discipline
- Long transcripts / investigation logs go via SendMessage to the orchestrator (or the `reports/fixes/FIX-*/`
  per-ticket transcript), **never** as standalone files in the repo (per `.claude/rules/reports.md`).
- End with the marker block your role defines (the developer — `fullstack-backend` / `fullstack-frontend`:
  `FIX_STATUS`/`PR_TITLE`/`PR_URL`/`CONFIDENCE`/`ROOT_CAUSE`; the reviewer — `backend-reviewer` /
  `frontend-reviewer`: `REVIEW: APPROVE|REQUEST_CHANGES` + reasons + `CONFIDENCE`).
- Real-user / browser rules do **not** apply here — this team writes code; it does not drive browsers.
  E2E verification (Gate 6) is delegated back to `qa-backend-expert` (module/platform) or
  `qa-frontend-expert` (vc-frontend) via `/qa-regression`.
