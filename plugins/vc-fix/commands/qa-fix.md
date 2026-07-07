---
description: "Autonomous fix for an already-filed bug: triage → confirm root-cause → route to one repo → reproduce by unit test → minimal fix → self code-review → branch + PR + CI/E2E → STOP for human review. Single repo only. Never auto-merges. Interactive twin of ci/run-fix-cycle.ts."
argument-hint: "VCST-XXXX"
disable-model-invocation: true
---

# /qa-fix — Autonomous Bug Fix (interactive)

Pick up a bug **already filed by `/qa-bug`** and drive it through the auto-fix lifecycle to an open PR,
then **STOP for human review**. This is the **interactive twin** of the headless `ci/run-fix-cycle.ts`
(the same relationship `/qa-regression` has with `ci/run-regression.ts`). It **reuses** that pipeline's
infra and the shared gate ladder in `.claude/rules/quality-gates.md`.

**Designed to generalize.** The pipeline is repo-kind- and project-agnostic: it routes to **one**
allowed product repo of any kind and delegates the fix to the developer agent that matches that kind.
Adding frontend coverage, a new module pattern, or another org/customer fork is **data + an agent**, not
a rewrite:

| Repo kind (from `skills/qa-fix-routing/repo-router.ts`) | Repos | Developer agent | Toolchain (`REPO_PROFILES`) |
|---|---|---|---|
| `module` / `platform` | `vc-module-*`, `vc-module-x-*`, `vc-platform` | **`fullstack-backend`** (live) | .NET 10 / xUnit (+ module Admin Angular / Jasmine) |
| `frontend` | `vc-frontend` | **`fullstack-frontend`** (live; CI twin `ci/agents/fix-frontend-agent.md`) | Vue 3 / TS / vitest (+ in-repo UI kit / Storybook) |

Routing, the repo allowlist, and the org are **config** (`skills/qa-fix-routing/fix-repos.json`; org overridable
via `FIX_REPO_ORG` for customer forks / other projects) — `/qa-fix` reads them via
`skills/qa-fix-routing/repo-router.ts` (`suggestRepo` / `isAllowedRepo` / `repoProfile` / `checkoutForFix`) and the
live module graph (`skills/qa-fix-routing/module-registry.ts`). Workspace `.fix-workspace/`, branch
`claude/qa-autofix/VCST-XXXX`, output `reports/fixes/FIX-*/`.

> **Profile-driven, not Jira/GitHub-hardcoded.** Which **bug tracker** (Jira / Azure Boards) and
> **code host** (GitHub / Azure Repos) every phase talks to comes from `project-profile.json`
> (written by `/project-init`). Read [`knowledge/execution/tracker-ops.md`](../knowledge/execution/tracker-ops.md)
> for the per-tracker resolve/comment/transition recipes, live transition discovery (never hardcode a
> workflow name), ticket-key formats, and the `contributionPlan(repo)` → clone/push/PR matrix. **With no
> profile ⇒ Jira / GitHub / VirtoCommerce, direct PRs — the original behaviour, unchanged.** The single
> hard invariant on a client deployment: **client code never leaves the client project** (`quality-gates.md`
> §2a); the upstream gets platform contribution only.

## Usage
```
/qa-fix VCST-1234        # fix a bug already filed (+ reported by /qa-bug)
```
`/qa-fix` does NOT create the ticket. It needs **at least one** of: a resolvable ticket in the tracker
**or** a local `/qa-bug` report — only when **both** are missing does it stop and ask the user to run
`/qa-bug` first (matching the CI twin `ci/run-fix-cycle.ts`, which bails only on `!ticket && !bugReport`).
A ticket with no local report is the **normal client-deployment case** (the client's QA filed the bug
straight in their tracker and never ran `/qa-bug`): `/qa-fix` continues, using the ticket
description/STR/attachments as the repro context. Once invoked it **auto-continues** through all phases;
**Gate 0/Gate 1** are the automatic cut-offs (a STOP leaves the ticket filed for a human).

> **Hard orchestration rule** (as in `qa-test-lifecycle.md`): do NOT run phases inline. Each phase is
> delegated to its owning agent via the Task tool. The orchestrator only parses input, evaluates gates
> (`quality-gates.md`), transitions JIRA (ask-user-first), and prints phase verdicts.
>
> **Never auto-merge** — `merge_pull_request` / `gh pr merge` are forbidden (G7, triple-guarded).

---

## Phase 0 — Pre-flight
1. Resolve the ticket via the **profile's tracker** (`tracker.kind`): Jira → Atlassian MCP
   `getJiraIssue`; Azure Boards → `az boards work-item show` / ADO REST (see
   [`tracker-ops.md`](../knowledge/execution/tracker-ops.md) §2). Use the ticket **key format the
   tracker gave you** verbatim (`ABC-123` for Jira, a bare `12345` for Azure Boards — not always `VCST-`).
   Confirm it's a Bug in a workable status. Load the linked `/qa-bug` report from `reports/bugs/open/`
   (or `fixed/`) **if one exists** — it's the preferred input, not a hard requirement. (Match the report
   to the ticket by the tracker's key format: for Azure Boards' bare numeric ids match `AB#<n>` / `#<n>`,
   NOT a bare `<n>` substring — `521` would otherwise false-match `VCST-5218`.)
2. Proceed when **either** the ticket **or** a local report resolves; **STOP only when both are absent**
   → "No `<key>` in the tracker and no local `/qa-bug` report — run `/qa-bug <key>` first to reproduce +
   file the report." Otherwise, by case:
   - **Ticket + report** (native VC path) → use the report as the primary signal, unchanged.
   - **Ticket, no report** (typical client deployment) → **do NOT stop.** Build the repro context from
     the ticket description/STR/attachments; the Fix Routing block is absent, so Gate 1 derives the route
     via `suggestRepo()` (it already handles a missing block), and the live reproduction is done in the
     Phase 1 root-cause step by the routed QA expert. On PASS this writes the standard
     `reports/bugs/open/*.md` so all downstream gates see the usual report.
   - **Report, no ticket** (rare) → proceed off the report.
3. `/qa-env-check endpoints`; **build verify — source depends on `projectType`:** native platform →
   deployed versions via GitHub MCP from `vc-deploy-dev` (branch matching `TEST_ENV`, default `vcst-qa`);
   **client deployment → `GET {BACK_URL}/api/platform/modules`** (the deployment exposes its own module/
   Platform versions; a client has no `vc-deploy-dev` access — `tracker-ops.md` §5). Context7 query on
   expected post-fix behavior.
4. Create the run dir `reports/fixes/FIX-YYYY-MM-DD-HHMM/` (heavy artifacts gitignored).

> **Write-credential preflight moves to *after* Gate 1** (Phase 1) — the host to probe (GitHub vs Azure
> Repos, PAT vs `gh-cli` vs `az`) isn't known until the routed repo's `contributionPlan` is resolved.
> Probing before routing bakes in a GitHub assumption that breaks on an Azure-Repos client. See
> `tracker-ops.md` §4.

## Phase 1 — Triage (Gate 0) + Root-cause + Repo route (Gate 1)
> **Owner:** `qa-lead-orchestrator` (triage) → `qa-backend-expert` (root-cause). Reuses the
> `ci/agents/fix-triage-agent.md` criteria and `skills/qa-fix-routing/repo-router.ts`.

- **Gate 0 — fix-eligibility triage** (`/qa-defect classify` + `/qa-risk`): proceed ONLY if the bug is
  a **simple, low-risk, localized, non-breaking, code-fixable** defect. **BAIL** (before any clone) on
  by-design / config-gated / env-data-drift / API-only-repro / security-disclosure / no-STR / needs
  refactoring / breaking change / ambiguous. On BAIL: comment the ticket out-of-auto-fix-scope + reason,
  leave at TO DO, end.
- **Gate 1 — single target repo:** if the `/qa-bug` report carries a **Fix Routing block** (Suggested repo
  + `repoKind` + RCA anchor + routing confidence — see `qa-bug.md` Step 4), read it **verbatim as the
  primary signal** and *confirm* it (don't re-derive from scratch): validate the named repo with
  `isAllowedRepo()` and verify the RCA anchor with `mcp__github__search_code`. Only when the block is
  absent, confidence is LOW, or the anchor doesn't confirm, fall back to deriving the route from the
  **owning layer** + RCA via `suggestRepo()`. Either way: resolve to exactly ONE allowed repo, determine
  the repo **kind** (`repoKind`) → pick the matching developer agent (table above). Multi-repo /
  off-allowlist / no-match → STOP, comment, hand off. Never guess. (If a *future* routed kind ever has
  no developer agent enabled yet, STOP with "routed to <repo> (<kind>); no developer agent enabled for
  this kind yet — handing off"; the ticket stays filed. Both live kinds — `module`/`platform` and
  `frontend` — have an agent today.)
- **Gate 1b — frontend provenance (client deployments only):** if the routed repo is a **client
  `frontend` fork** (`repoOwnership(routeRepo) === "client"` AND `repoKind === "frontend"`), the symptom
  alone can't tell a *client customization* bug from an *unmodified-platform* bug. Resolve it from the RCA
  anchor's **code provenance** against the fork's upstream (`clientUpstream(routeRepo)` → `{ upstream,
  upstreamRef }`): fetch the anchor file from the client repo AND from `vc-frontend @ upstreamRef`, then
  feed the signals to `classifyFrontendProvenance()` (`skills/qa-fix-routing/provenance.ts`) — anchor only in client, or
  differs ⇒ **client** (fix + PR on the client repo); byte-identical to unmodified upstream ⇒ **platform**;
  anchor missing / uncomparable ⇒ **client + LOW ⇒ STOP** (containment-first, §2a). Then
  `frontendDeliveryPlan()` gives the action: **fix-client-fork**, **upstream-contribution** (a platform
  bug → **fork `vc-frontend` and open a fork-PR to VirtoCommerce**, exactly the standard §1a platform path
  — the client picks the fix up on its next release + fork sync; we do NOT patch the client fork with
  platform code), or **stop-upgrade** (already fixed upstream → the client should sync / upgrade). An
  upstream **Issue** instead of a PR happens **only** when Gate 0 already judged the bug too-complex /
  multi-repo. (Native platform / no client frontend fork ⇒ this sub-gate is a no-op; the route stays platform.)
- **Write-credential preflight (now that the host is known):** probe only the axis
  `contributionPlan(routeRepo).host` needs — GitHub PAT (`GH_TOKEN="$GITHUB_FIX_BUGS_TOKEN" gh api
  repos/<owner>/<repo> --jq .permissions.push` → `true`), a `gh-cli` browser session (`gh auth status`
  shows write), or Azure Repos (`GET {base}/_apis/git/repositories/<repo>` returns JSON, not the 203+HTML
  sign-in). Missing/insufficient → STOP before clone. (`tracker-ops.md` §3–4; native platform resolves to
  the original `GITHUB_FIX_BUGS_TOKEN` + `VirtoCommerce/<repo>` probe.)
- On PASS: transition the ticket to the **in-progress** role state (Jira: discover the transition live via
  `getTransitionsForJiraIssue`, don't hardcode "Take to development"; Azure Boards: `System.State` via
  `tracker.azure.stateMap`; **ask the user first**) with a comment naming the routed repo + kind + (for a
  frontend route) the provenance verdict.

## Phase 2 — Clone + Reproduce (Gate 2)
> **Owner:** the routed developer agent (`fullstack-backend` for module/platform; `fullstack-frontend`
> for frontend). Skills: `/dotnet-unit-test` + `/angular-admin` (backend) or `/vue-unit-test`
> (+ `/storybook-test` for UI-kit interaction bugs, optional) (frontend).

- Clone the one routed repo into `.fix-workspace/` on branch `claude/qa-autofix/VCST-XXXX` (reuse
  `checkoutForFix`; base = detected default branch). Use the repo's own test command (`repoProfile`).
- Add a NEW failing test encoding the STR/RCA → confirm **RED**. Trivial-skip allowed for one-line
  guards/typos (note in PR body).

## Phase 3 — Implement fix (Gate 3)
> **Owner:** the routed developer agent.
- Smallest correct change to production code → test **GREEN**; **all pre-existing tests stay green &
  UNMODIFIED**; BL-* preserved. Existing test breaks → STOP (contract conflict). Build + test clean
  (per `repoProfile`).

## Phase 4 — Self code-review (Gate 4)
> **Owner:** the kind-appropriate reviewer — `backend-reviewer` (module/platform) or `frontend-reviewer`
> (frontend). Reviews the local diff before any PR.
> `APPROVE` → continue; `REQUEST_CHANGES` → developer revises (≤2 iterations); still not approved → STOP.

## Phase 5 — Branch + PR
> **Owner:** the routed developer agent.
- `git commit` (Conventional Commits + ticket key), **authored as the human token-owner with Claude as
  `Co-Authored-By`** (NOT a bot author — CLA Assistant blocks bot-authored commits; pattern in
  `developers/shared-instructions.md` §Commit identity) → push the work branch → **open the PR on the
  host `contributionPlan(routeRepo)` resolved** (GitHub `gh pr create`; Azure Repos ADO REST
  `POST …/pullrequests`; platform fork-mode `--head <forkOwner>:<branch>` — the four cases +
  auth-per-host are in [`tracker-ops.md`](../knowledge/execution/tracker-ops.md) §3). A **normal PR
  for human review — not auto-merged**, **PR title `fix(<key>): <summary>`** (Conventional Commits, ticket
  key in the scope slot; see
  `developers/shared-instructions.md` §PR title), body from the agent's PR template ("DO NOT MERGE until
  human review"; backend adds "needs deploy verification"), label, link the tracker.
- **If Gate 1b resolved the route to `upstream-contribution`** (a byte-identical **platform** bug in the
  storefront): the branch + PR go to the **VirtoCommerce upstream**, not the client fork — fork `vc-frontend`,
  apply the fix, open a **fork-PR** (`--head <forkOwner>:<branch>`), **scrubbed of any client source / paths /
  identifiers** (§2a). This is the ordinary platform fork-PR path (same as a backend platform bug); the client
  receives it through a later release + fork sync. (An upstream **Issue** instead is only for a Gate-0
  too-complex / multi-repo bail — handled at Gate 0, not here.)
- Transition the ticket to the **in-review** role state (Jira: live-discover the transition, don't hardcode
  "Go to review"; Azure Boards: `System.State` via `stateMap`; ask the user first) with the PR link.

## Phase 6 — Await CI + E2E (Gates 5 & 6)
> **Owner:** orchestrator (CI poll) + `qa-backend-expert` / `qa-frontend-expert` (E2E, by kind).
- **Gate 5 (CI) — the check contract depends on ownership + host:**
  - **Platform repo / platform fork-PR on GitHub** → the full VirtoCommerce contract below (it is the
    *VirtoCommerce-repo* CI contract, not a universal one).
  - **Client repo** (GitHub or Azure Repos) → the client's own PR checks, **discovered live, not assumed**:
    GitHub client PR → poll whatever `gh pr checks` reports; Azure Repos PR → poll the PR's ADO build
    policies / statuses (`GET …/pullrequests/<id>` + policy evaluations). **If the client repo has no PR
    checks at all**, Gate 5 = the **local build + unit test** already proven green in Gate 3 (per the
    `repoProfile` — client `buildCmd`/`testCmd` overrides apply), and the PR is labelled **"no CI — local
    build+test only"**. Never wait on VirtoCommerce-specific jobs (`auto-tests`, SonarCloud, `license/cla`)
    on a client repo — they don't exist there. Read the failing logs, classify, self-correct (≤2), re-poll,
    same as platform.
- **Platform CI contract (platform repos / fork-PRs):** poll `gh pr checks` /
  `mcp__github__get_pull_request_status` until the repo's
  GitHub Actions are all `success` + `mergeable`. Wait on **both** PR jobs (background polling, not
  blocking sleeps): (1) the build/test job — **`ci`** (build + unit tests + the **SonarCloud quality
  gate**: `Quality Gate` / `SonarCloud Code Analysis`; backend also runs **Swagger validation** on
  PRs to `dev`), and (2) the **`auto-tests`** job — the shared pytest **`graphql, restapi, e2e`** suites
  against a real/deployed instance (a vc-frontend PR to `dev` auto-deploys to the `qa` env first) — plus
  `license/cla`. **Storybook CI does not run on PRs** — don't wait on it. **RED → fetch and read the logs
  before acting** (`gh run view <id> --log-failed`; for `auto-tests`, the failing pytest case + assertion;
  for Sonar, the PR annotations), **classify the reason**, then the developer self-corrects in the SAME
  repo (≤2 iterations), re-pushes, re-polls. Real regression in `auto-tests` on a touched area → fix the
  root cause; unrelated/known-flaky `auto-tests` red → re-run once, then note + escalate (don't contort
  the fix). Sonar QG red on changed lines → fix the valid finding / add new-code coverage within
  minimal-diff + never-edit-existing-tests; don't chase pre-existing debt or off-diff nitpicks. Persistent
  RED / cross-repo / repo-owned QG threshold → STOP + hand off. (Full reason→action table:
  `developers/shared-instructions.md` §After the PR.)
- **Gate 6 (E2E):** once the PR's artifact deploys to QA, the kind-appropriate QA expert runs
  `/qa-regression <group>` (Backend or Frontend suites for the affected area, from `module-suite-map.md`).
  Backend is static-only pre-deploy → the PR carries **"needs deploy verification"** and G6 closes
  post-merge via the regression pipeline + `/qa-verify-fix`. **For a CLIENT custom module / storefront fork
  there is usually no regression suite in `module-suite-map.md`** — degrade to a **targeted re-run of the
  bug's own STR** (the `/qa-bug` reproduction steps) against the deployed client env, plus any client-supplied
  suite. State the reduced scope in the PR/verify note; do not claim broad regression coverage that wasn't run.

## Phase 7 — STOP for human review (Gate 7)
- Transition the ticket to the **ready-for-test** role state (Jira: live-discover, don't hardcode "Ready
  to test"; Azure Boards: `System.State` via `stateMap`; ask the user first) with "CI green + E2E result +
  awaiting human review/merge".
- Write `reports/fixes/FIX-*/fix-report.md` + `summary.json` (ticket, repo, kind, branch, PR URL, gate
  results, confidence). Print the PR link. **End.** Never merge. Post-merge verification is the separate
  `/qa-verify-fix VCST-XXXX`.

---

## Autonomous / scheduled runs
Run `/qa-fix` unattended as a **Claude Code Routine** (`/schedule`) rather than custom cron — the
routine runs headless on a cron (min 1h) over the code-host + tracker connectors and can invoke this
command (e.g. *"scan the tracker for the `qa-autofix` label/tag, run `/qa-fix` on the top N eligible,
open PRs"* — Jira JQL or Azure Boards WIQL per `tracker.kind`).
This is why the work branch is **`claude/`-prefixed** (`claude/qa-autofix/VCST-XXXX`): routines may
only push `claude/*` branches by default. The headless `ci/run-fix-cycle.ts` + `auto-fix.yml` remain
available for CI-on-PR; the routine is the lighter scheduled trigger.

## Rules
- Single repo of any allowed kind; a STOP at any gate leaves the ticket filed for human handoff (see
  `.claude/rules/quality-gates.md`).
- Code review (Gate 4) delegates the mechanical bug/cleanup pass to the built-in **`/code-review`**
  skill; `backend-reviewer` adds only the VC-specific gate checklist on top.
- Reuse `skills/qa-fix-routing/fix-repos.json` + `skills/qa-fix-routing/repo-router.ts` + `skills/qa-fix-routing/module-registry.ts` — do not
  reinvent routing/checkout. Other org / customer fork → `FIX_REPO_ORG`. Workspace `.fix-workspace/`,
  branch `claude/qa-autofix/VCST-XXXX`, output `reports/fixes/FIX-*/`.
- Never modify existing tests (ADD only). Never auto-merge. Never echo any PAT. **Remote-write auth is
  per host** (`tracker-ops.md` §3): GitHub PAT host → `GH_TOKEN` ← `GITHUB_FIX_BUGS_TOKEN` (`.env.local`),
  not the ambient read-only token; GitHub `gh-cli` host → the ambient logged-in `gh`; Azure Repos →
  `ADO_PAT` / `az login`. Commits are **authored as the human token-owner + `Co-Authored-By: Claude`**
  (CLA Assistant blocks bot-authored commits) — patterns in `developers/shared-instructions.md`
  §GitHub authentication / §Commit identity.
- **Client-code containment (§2a) is absolute:** a client-owned repo is never forked / PR'd / issue-filed
  upstream; an upstream issue carries only platform-generic, client-scrubbed content.
- Ask before every tracker transition (consistent with `/qa-bug` Step 5 and `/qa-verify-fix` Step 6).
- Reports follow `.claude/rules/reports.md` (the `reports/fixes/` category; long logs via SendMessage).
