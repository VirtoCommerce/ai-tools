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

> **Note on `ci/…` references.** Mentions of `ci/run-fix-cycle.ts`, `ci/agents/*`, `ci/lib/*` throughout
> this command and the agent docs are **design heritage** — the headless twin that runs in the native
> agentic checkout. **That `ci/` tree is NOT shipped in the installed plugin**, so treat those paths as
> conceptual provenance, not files to open. In the plugin, the equivalents are: routing → the baked
> `project-profile.json` (+ `skills/qa-fix-routing/*`), tracker/PR ops → `skills/qa-fix-routing/ado.mjs`.

**Designed to generalize.** The pipeline is repo-kind- and project-agnostic: it routes to **one**
allowed product repo of any kind and delegates the fix to the developer agent that matches that kind.
Adding frontend coverage, a new module pattern, or another org/customer fork is **data + an agent**, not
a rewrite:

| Repo kind (from `skills/qa-fix-routing/repo-router.ts`) | Repos | Developer agent | Toolchain (`REPO_PROFILES`) |
|---|---|---|---|
| `module` / `platform` | `vc-module-*`, `vc-module-x-*`, `vc-platform` | **`fullstack-backend`** (live) | .NET 10 / xUnit (+ module Admin Angular / Jasmine) |
| `frontend` | `vc-frontend` | **`fullstack-frontend`** (live; CI twin `ci/agents/fix-frontend-agent.md`) | Vue 3 / TS / vitest (+ in-repo UI kit / Storybook) |

> A `module` repo may additionally declare an embedded **frontend sub-app** on a different stack
> (`moduleFrontendSubApps` in `skills/qa-fix-routing/fix-repos.json`, e.g. `vc-module-pagebuilder`'s Vue 3
> "shell"). When Gate 1's RCA anchor falls under a declared sub-app path, the developer agent for **this
> bug** is `fullstack-frontend` instead (via `/vc-shell-fix`), scoped to the sub-app directory —
> `repoKind` itself stays `"module"`, unaffected for every other bug in that repo.

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

## Orientation — the deployment profile is the KEY (read it once, first)

Before Phase 0, read `project-profile.json` from the project root and treat it as the complete,
declarative source of truth. `/project-init` has **baked** the resolved facts into it so you do
**not** re-derive routing/ownership/branches/states by reading or mentally emulating the `.ts`
helpers, and do **not** ask the operator what the profile already answers.

- **Paths & cwd discipline** (`profile.paths`): use `paths.projectRoot` as the absolute base for
  **everything** — `.env`/secrets (`join(projectRoot, paths.secretsEnv)`), `paths.workspace`
  (`.fix-workspace`), `paths.reports`. **Never `cd` into the workspace**; run git as
  `git -C <abs>`. Load secrets ONLY from the absolute path (a drifted Bash cwd made a relative
  `source .env.local` silently empty → an ADO write 302'd and was misdiagnosed). To invoke a
  bundled plugin script, resolve `$pluginRoot` = the ACTIVE install path at runtime via
  `claude plugin list --json` (**not** from the profile — there is no baked plugin path; see
  [`knowledge/execution/plugin-root.md`](../knowledge/execution/plugin-root.md)), then `node "$pluginRoot/skills/…"`.
- **Execution mode** (`profile.runtime`): when `helpersRunnable` is `true` (native agentic
  checkout) you MAY execute the `.ts`/`.mjs` routing helpers; when `false` (installed plugin)
  **read the baked profile fields** — do not try to run/emulate `repo-router.ts` / `provenance.ts`.
- **Routing / ownership / delivery**: for a client bug, the routed repo is the matching
  `profile.repos.client[]` entry; its `contribution` block (host, `prApi`, `cloneUrl`, `prTarget`,
  `authEnv`), `integrationBranch`, `workBranchPrefix`, `toolchain`, `upstream`/`upstreamRef`, and
  (frontend) `localVerify` are already resolved. Confirm the RCA anchor; don't re-derive the plan.
- **Tracker ops** — use the ADO helper, never hand-rolled curl+python (it fixes encoding/auth/escaping):
  `node "$pluginRoot/skills/qa-fix-routing/ado.mjs" <cmd>` — `get-workitem`, `comment`, `transition`,
  `create-pr`, `list-policies`, `get-file`, `list-refs` (org/project/apiBase default from the profile).
  Jira path unchanged (Atlassian MCP).
- **Status transitions** — map the lifecycle ROLE to a state via `profile.tracker.azure.roleStates`
  (`in-progress` / `in-review` / `ready-for-test` / `done`) — these are the deployment's REAL states
  (e.g. `On Dev` / `On Review` / `Ready for QA` / `Closed`), scanned per work-item type. When
  `tracker.azure.transitionPolicy` is `auto`, transition **silently by role and just log it — do NOT
  ask the operator**. (`confirm-once` = one upfront confirmation; `ask` = the old per-transition ask;
  Jira still discovers transitions live.)
- **Azure Repos PR**: opened by the **orchestrator** via `ado.mjs create-pr` (the developer agent only
  clones/pushes) — a subagent can't cross an ADO write boundary reliably. Base + target =
  `contribution.prTarget` (= `integrationBranch`, e.g. `dev` — NOT necessarily `defaultBranch`).
- **No profile / `projectType: platform`**: every field above is empty ⇒ fall back to the original
  Jira / GitHub / VirtoCommerce behaviour (live transition discovery, `gh pr create`, base `dev`).
  This section changes nothing for the native platform path.

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
> (`quality-gates.md`), transitions the ticket (per `tracker.azure.transitionPolicy` — `auto` ⇒ silent,
> `ask` ⇒ confirm; see Orientation), and prints phase verdicts.
>
> **Never auto-merge** — `merge_pull_request` / `gh pr merge` are forbidden (G7, triple-guarded).
>
> **Stalled-sub-agent guard.** A dispatched agent that returns with **0 tool-uses / an empty or generic
> body** (it idled instead of working — observed: `fullstack-frontend` first launch, ~2 s, 0 calls) is a
> FAILURE, not a result. **Auto-retry it ONCE** via `SendMessage` with an explicit "you did not start —
> execute the task now with your tools, there is no input file coming" nudge (+ the absolute paths /
> routed repo). Only escalate to the user if the retry also stalls. Do not proceed as if the empty return
> were a real answer.

## Phase 0 — Pre-flight
1. Resolve the ticket via the **profile's tracker** (`tracker.kind`): Jira → Atlassian MCP
   `getJiraIssue`; Azure Boards → **`node "$pluginRoot/skills/qa-fix-routing/ado.mjs" get-workitem --id <n>`**
   (do NOT hand-roll `curl`+`python` — that caused the repeated `/tmp`/`cp1252`/emoji failures last run;
   see [`tracker-ops.md`](../knowledge/execution/tracker-ops.md) §2). Use the ticket **key format the
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
3. `/qa-env-check endpoints`; **build verify — driven by `profile.buildVerify.source`:**
   `vc-deploy-dev` (native platform → deployed versions via GitHub MCP from `vc-deploy-dev`, branch
   matching `TEST_ENV`, default `vcst-qa`); `modules-endpoint` (client → `GET {BACK_URL}/api/platform/modules`
   with an admin token — the deployment exposes its own module/Platform versions; `tracker-ops.md` §5).
   **Exception — a frontend-only route:** once Gate 1 resolves the route to a `kind:"frontend"` repo, the
   relevant version is the **storefront** version, which the ticket already carries (`App version` in the
   bug's system info) — **take it from the ticket; do NOT call the admin modules endpoint** (that is a
   backend-version check and needs a token). Context7 query on expected post-fix behavior.
4. Create the run dir `reports/fixes/FIX-YYYY-MM-DD-HHMM/` (heavy artifacts gitignored).

> **Write-credential preflight moves to *after* Gate 1** (Phase 1) — the host to probe (GitHub vs Azure
> Repos, PAT vs `gh-cli` vs `az`) isn't known until the routed repo's `contributionPlan` is resolved.
> Probing before routing bakes in a GitHub assumption that breaks on an Azure-Repos client. See
> `tracker-ops.md` §4.

## Phase 1 — Triage (Gate 0) + Root-cause + Repo route (Gate 1)
> **Owner:** the top-level session (triage — no separate orchestrator agent is shipped in `vc-fix`)
> → `qa-backend-expert` (root-cause). Reuses the `ci/agents/fix-triage-agent.md` criteria
> (design-heritage; CI-only) and `skills/qa-fix-routing/repo-router.ts`.

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
  - **Sub-app override:** when `kind === "module"`, also call `resolveOwningSubApp(routeRepo, rcaAnchor)`
    (the RCA anchor from the Fix Routing block or the derived route). A **match** overrides the developer
    agent to `fullstack-frontend` (working directory = `<checkout>/<subApp.path>`, toolchain = the
    sub-app's declared profile) — ownership/PR-target/allowlist are unaffected, `repoKind` stays
    `"module"`. **No match** → today's `fullstack-backend` route, unchanged. An anchor in an undeclared
    sub-app of a hybrid repo (e.g. a stack with no agent support yet) is **not** silently mis-routed — it
    falls through to `fullstack-backend`, which will honestly STOP at Gate 2 if it has no capability for
    that stack.
- **Gate 1b — frontend provenance (client deployments only):** if the routed repo is a **client
  `frontend` fork** (`repoOwnership(routeRepo) === "client"` AND `repoKind === "frontend"`), the symptom
  alone can't tell a *client customization* bug from an *unmodified-platform* bug.
  > **Anchor-first (avoid last run's wrong-anchor detour):** CONFIRM the anchor file actually contains the
  > symptom — **read it first** — before running the provenance byte-diff (comparing the wrong file, e.g. a
  > `<slot/>`-only wrapper, wastes a round and risks a false verdict). Prefer `filename:`/path-scoped
  > discovery (`ado.mjs get-file`, `filename:<file>` on GitHub) over free-text `search_code` (which
  > returned 0 hits repeatedly last run before a filename query worked).
  Resolve it from the RCA
  anchor's **code provenance** against the fork's upstream (`clientUpstream(routeRepo)` → `{ upstream,
  upstreamRef, upstreamRefResolved, forkVersion }`).
  > **`upstreamRef` must be a RESOLVABLE tag before you diff.** `/project-init` now bakes a concrete,
  > verified upstream tag (the fork line's base, e.g. `2.49.0`) — NOT the bare line label `2.49` or the
  > fork's own patch version `2.49.7`, neither of which is a git ref (both 422 on `vc-frontend`). Use it
  > as-is when `upstreamRefResolved === true`. Otherwise (`upstreamRefResolved === false`, or the ref 422s
  > when you fetch it) **reconstruct** a resolvable baseline before comparing: try `<major>.<minor>.0`,
  > then the highest existing `<major>.<minor>.x` (`gh api repos/<upstream>/tags` / `git ls-remote --tags
  > <upstream>`), then the nearest tag ≤ the line. If NONE resolves → **ASK the operator** for the base
  > tag — do NOT silently treat everything as client (that quietly kills upstream routing). Over-attributing
  > to client is safe; leaking client code upstream is not (§2a), so when in doubt STOP.
  Then fetch the anchor file from the client repo AND from `vc-frontend @ upstreamRef`, then
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
  `getTransitionsForJiraIssue`, don't hardcode "Take to development"; Azure Boards: set `System.State` to
  `profile.tracker.azure.roleStates["in-progress"]` via `ado.mjs transition`). **Follow
  `tracker.azure.transitionPolicy`: `auto` ⇒ transition silently and just log it (do NOT ask); `ask` ⇒
  confirm first** (Jira, or an unscanned map, defaults to ask). Add a comment naming the routed repo +
  kind + (for a frontend route) the provenance verdict.

## Phase 2 — Clone + Reproduce (Gate 2)
> **Owner:** the routed developer agent (`fullstack-backend` for module/platform; `fullstack-frontend`
> for frontend, **and** for a module's declared embedded frontend sub-app). Skills: `/dotnet-unit-test` +
> `/angular-admin` (backend) or `/vue-unit-test` (+ `/storybook-test` for UI-kit interaction bugs,
> optional) (frontend) or `/vc-shell-fix` (a module-embedded sub-app override matched at Gate 1).

- Clone the one routed repo into `.fix-workspace/` on branch `claude/qa-autofix/VCST-XXXX` (reuse
  `checkoutForFix`; base = detected default branch). Use the repo's own test command (`repoProfile`).
- Add a NEW failing test encoding the STR/RCA → confirm **RED**. Trivial-skip allowed for one-line
  guards/typos (note in PR body).

## Phase 3 — Implement fix (Gate 3)
> **Owner:** the routed developer agent.
- Smallest correct change to production code → the **scoped** repro test **GREEN**; pre-existing tests
  stay green & **UNMODIFIED** (proven by leaving them untouched + the scoped spec passing — do **NOT**
  re-run the whole suite to "confirm no regression"); BL-* preserved. Existing test breaks → STOP
  (contract conflict). **Green gate = typecheck + lint + scoped spec.** A production **`build` and the
  full suite are NOT part of the gate for a template-/style-only diff** (e.g. a `.vue` template edit with
  no `<script>` change) — run them only when the diff changes compiled logic/TS or touches
  shared/core/UI-kit code (see `quality-gates.md` G3 + `fullstack-frontend` Gate 3).

## Phase 4 — Self code-review (Gate 4)
> **Owner:** the kind-appropriate reviewer — `backend-reviewer` (module/platform) or `frontend-reviewer`
> (frontend). Reviews the local diff before any PR.
> `APPROVE` → continue; `REQUEST_CHANGES` → developer revises (≤2 iterations); still not approved → STOP.

## Phase 5 — Branch + PR
> **Owner:** the routed developer agent **commits + pushes**; PR-open ownership depends on the host —
> `contribution.host == "azure-repos"` ⇒ the **ORCHESTRATOR** opens the PR via
> `ado.mjs create-pr` (a subagent can't reliably cross an ADO write boundary — it stalled on the
> permission classifier last run); `github` ⇒ the developer agent opens it with `gh pr create`.
> The work branch bases off `contribution.prTarget` (= `integrationBranch`, e.g. `dev`), and the PR
> **targets that same branch** — not necessarily `defaultBranch`.
- `git commit` (Conventional Commits + ticket key), **authored as the human token-owner with Claude as
  `Co-Authored-By`** (NOT a bot author — CLA Assistant blocks bot-authored commits; pattern in
  `knowledge/agents/developers/shared-instructions.md` §Commit identity) → push the work branch → **open the PR on the
  host `contribution` resolved** (Azure Repos: orchestrator `ado.mjs create-pr --repo <bare> --source
  <branch> --target <prTarget> --title … --description-file … --work-item <id> [--labels a,b]` — one call
  opens the PR, links the work item, AND applies labels (no separate raw-curl); GitHub `gh pr create`;
  legacy platform fork-mode `--head <forkOwner>:<branch>` — the four cases +
  `POST …/pullrequests`; platform fork-mode `--head <forkOwner>:<branch>` — the four cases +
  auth-per-host are in [`tracker-ops.md`](../knowledge/execution/tracker-ops.md) §3). A **normal PR
  for human review — not auto-merged**, **PR title `fix(<key>): <summary>`** (Conventional Commits, ticket
  key in the scope slot; see
  `knowledge/agents/developers/shared-instructions.md` §PR title), body from the agent's PR template ("DO NOT MERGE until
  human review"; backend adds "needs deploy verification"), label, link the tracker.
- **If Gate 1b resolved the route to `upstream-contribution`** (a byte-identical **platform** bug in the
  storefront): the branch + PR go to the **VirtoCommerce upstream**, not the client fork — fork `vc-frontend`,
  apply the fix, open a **fork-PR** (`--head <forkOwner>:<branch>`), **scrubbed of any client source / paths /
  identifiers** (§2a). This is the ordinary platform fork-PR path (same as a backend platform bug); the client
  receives it through a later release + fork sync. (An upstream **Issue** instead is only for a Gate-0
  too-complex / multi-repo bail — handled at Gate 0, not here.)
- Transition the ticket to the **in-review** role state (Jira: live-discover the transition, don't hardcode
  "Go to review"; Azure Boards: `roleStates["in-review"]` via `ado.mjs transition`; obey
  `transitionPolicy` — `auto` ⇒ no ask) with the PR link.

## Phase 6 — Await CI (Gate 5); E2E (Gate 6) is delegated, not run here
> **Owner:** orchestrator (CI poll only). **`/qa-fix` does NOT run a live E2E** — Gate 6 is a separate
> skill's job post-deploy (`/qa-verify-fix`, or the future local-PR-artifact verify skill). See G6 below.
- **Gate 5 (CI) — the check contract depends on ownership + host:**
  - **Platform repo / platform fork-PR on GitHub** → the full VirtoCommerce contract below (it is the
    *VirtoCommerce-repo* CI contract, not a universal one).
  - **Client repo** (GitHub or Azure Repos) → the client's own PR checks, **discovered live, not assumed**:
    GitHub client PR → poll whatever `gh pr checks` reports; Azure Repos PR → poll the PR's ADO build
    policies via `ado.mjs list-policies --repo <bare> --pr <id>` (uses `profile.tracker.azure.projectId`).
    **If the client repo has no PR checks at all** (empty policy list), Gate 5 = the **local typecheck +
    unit test** (and `build` only if Gate 3 ran it — a template-/style-only diff legitimately skips build)
    already proven green in Gate 3 (per `profile.repos.client[].toolchain`), and the PR is labelled
    **"no CI — local build+test only"**. Never wait on VirtoCommerce-specific jobs (`auto-tests`,
    SonarCloud, `license/cla`) on a client repo — they don't exist there. Read the failing logs, classify,
    self-correct (≤2), re-poll, same as platform.
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
  `knowledge/agents/developers/shared-instructions.md` §After the PR.)
- **Gate 6 (E2E) — `/qa-fix` does NOT run a live E2E gate. This is by design.**
  `/qa-fix`'s bar is **static**: reproduce (unit RED) → fix (unit GREEN) → review → PR. It does **not**
  stand up a running app, and it does **not** need to — the fix is unit-proven and the diff is under human
  review. **Live / visual re-verification (running the STR on a real artifact) is a SEPARATE skill's job**,
  decoupled and run post-merge/deploy:
  - **`/qa-verify-fix`** re-runs the bug's STR against the **deployed** artifact once the PR merges +
    deploys (the classic path; moves the ticket toward Ready for QA / Tested on QA).
  - A **future local-PR-artifact verify skill** (planned) will boot the platform/frontend locally against
    the **real PR artifact** — that is where `profile.repos.client[].localVerify` +
    [`frontend-local-verify.md`](../knowledge/execution/frontend-local-verify.md) get used. **They are DATA/
    recipe for that skill, NOT a `/qa-fix` step** — do not spin up `yarn dev` / Playwright here.
  - **Backend and frontend alike are static-only pre-deploy** (backend can't re-show its live symptom
    without a redeploy; frontend pixels/CLS need a running app). So when the bug has a **runtime/visual
    aspect**, the developer notes it and the PR is **labelled "needs deploy verification"**; that's the
    whole Gate-6 action inside `/qa-fix`.
  Do not claim broad regression coverage that wasn't run. (`module-suite-map.md` is a reference for which
  module owns the area, not a runnable selector; `/qa-regression` is full `vc-qa` only, not shipped here.)

## Phase 7 — STOP for human review (Gate 7)
- **Terminal state = `in-review` (`On Review`) — STOP there. Do NOT advance to `ready-for-test` /
  `Ready for QA`.** `/qa-fix` ends with the PR open and **awaiting a human PR review**; the ticket stays
  at **On Review** until a person reviews (and merges) the PR. `ready-for-test` (`Ready for QA`) means the
  fix is merged + deployed and genuinely ready for QA to test — that transition is **NOT** `/qa-fix`'s to
  make; it happens later via `/qa-verify-fix` (post-deploy) or a human. (`roleStates["ready-for-test"]`
  stays in the profile for `/qa-verify-fix` to use — `/qa-fix` just doesn't apply it.)
- **Ensure** the ticket is at `in-review` (`roleStates["in-review"]` = `On Review`) — Phase 5 already set
  it when the PR opened; if for any reason it isn't there yet, set it now via `ado.mjs transition`
  (obey `transitionPolicy` — `auto` ⇒ no ask). Add/confirm a comment: "PR open for review; Gate 6 result;
  awaiting human review + merge".
- Write `reports/fixes/FIX-*/fix-report.md` + `summary.json` (ticket, repo, kind, branch, PR URL, gate
  results, confidence). Print the PR link. **End.** Never merge, never auto-advance past On Review.
  Post-merge/deploy verification (and the move toward Ready for QA / Tested on QA) is the separate
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
  (CLA Assistant blocks bot-authored commits) — patterns in `knowledge/agents/developers/shared-instructions.md`
  §GitHub authentication / §Commit identity.
- **Client-code containment (§2a) is absolute:** a client-owned repo is never forked / PR'd / issue-filed
  upstream; an upstream issue carries only platform-generic, client-scrubbed content.
- Tracker transitions follow `profile.tracker.azure.transitionPolicy`: `auto` (default once states are
  scanned) ⇒ transition silently by role and log it; `confirm-once`/`ask` ⇒ confirm (the original
  behaviour, and the Jira / unscanned default). Consistent with `/qa-bug` Step 5 and `/qa-verify-fix` Step 6.
- Reports follow `.claude/rules/reports.md` (the `reports/fixes/` category; long logs via SendMessage).
