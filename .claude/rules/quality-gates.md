# Quality Gates — Single Source of Truth

**This file is the only place the auto-fix gate ladder lives.** Both entry points reference it by
gate ID — they must never restate or diverge from these criteria:

- **Interactive:** `/qa-fix VCST-XXXX` (`commands/qa-fix.md`) + the `developers/` agent team
  (`fullstack-backend`, `backend-reviewer`).
- **Headless CI:** `ci/run-fix-cycle.ts` + `.github/workflows/auto-fix.yml` + `ci/agents/fix-triage-agent.md`
  / `fix-backend-agent.md` / `fix-frontend-agent.md`.

The two are twins (the same relationship as `/qa-regression` ↔ `ci/run-regression.ts`). They share
the same repo registry (`ci/config/fix-repos.json`), routing/checkout (`ci/lib/repo-router.ts`),
module graph (`ci/lib/module-registry.ts`), workspace (`.fix-workspace/`), branch convention
(`claude/qa-autofix/VCST-XXXX`), and output dir (`reports/fixes/FIX-*/`).

> Scope of this ladder: **bug auto-fix only.** Test-quality gates live in `/qa-review-tests`
> (8 dimensions); regression quality gates live in `/qa-metrics`. This file does not duplicate those.

---

## 1. The gate ladder (G0 → G7)

A fix run passes a gate or **STOPS**. Gates fire in order; the cheap, code-free gates (G0/G1) fire
**before any clone**, so rejected tickets cost almost nothing. `/qa-fix` requires a ticket already
filed by `/qa-bug`, so a STOP always leaves that ticket in place for human handoff.

| Gate | Name | Owner | PASS criteria | On FAIL / STOP |
|------|------|-------|---------------|----------------|
| **G0** | Fix-eligibility triage | `qa-lead-orchestrator` (interactive) / `fix-triage-agent` (CI) | **Simple, low-risk, code-fixable defect:** clear STR + clear expected-vs-actual; localized root cause (single bounded code site); small estimated diff; **no refactoring**; **no breaking changes** (no public REST/GraphQL/DTO/contract change, no DB schema/migration, no domain-event/manifest change); BL-* preserved; **not** by-design / config-gated / env-data-drift / API-only-repro / security-disclosure / no-STR | **BAIL before clone.** Comment ticket out-of-auto-fix-scope + reason; leave at TO DO; hand off. Triage emits `BAIL_CLASS` = `not-a-bug` (default — just comment & leave) \| `too-complex` \| `multi-repo`. On a **client deployment**, a `too-complex`/`multi-repo` BAIL on a *real* **platform** bug → file a **GitHub Issue on the VirtoCommerce upstream** (§1a) instead of only commenting. *When in doubt, BAIL.* |
| **G1** | Single target repo | orchestrator (validated by `isAllowedRepo`) | Resolves to **exactly one** allowed repo: a `vc-module-*` (C# and/or its Admin SPA UI), `vc-module-x-*` (xAPI), `vc-platform`, `vc-frontend`, **or a client-owned repo** (custom module / theme / storefront fork from `project-profile.json`). Owning layer ∈ {REST L4, xAPI L3, Admin-SPA L2 in the module repo (its legacy AngularJS `Web/Scripts/` **or a declared embedded frontend sub-app** — `resolveOwningSubApp()`, e.g. a Vue 3 "shell"), storefront L1 in `vc-frontend`} → kind (`module`/`platform`/`frontend`) **+ any sub-app override** picks the dev agent. A module sub-app match routes to `fullstack-frontend` for that bug only (`kind` stays `"module"`); no match falls through to `fullstack-backend`, unchanged. **`repoOwnership(repo)`** (client/platform) + **`contributionPlan(repo)`** (host github/azure-repos; mode direct/fork) pick the PR target/host per §1a | **STOP.** Multi-repo / cross-module / off-allowlist → comment + hand off (`ROUTE_REPO` rejected). Never guess. |
| **G2** | Reproduction (red) | kind-routed dev — `fullstack-backend` / `fullstack-frontend` (interactive) / `fix-*-agent` (CI) | A **new** unit test encodes the STR/RCA and **fails on current code** (xUnit for C#; vitest + `@vue/test-utils` for vc-frontend, see `/vue-unit-test`; module Admin UI has NO in-repo JS harness — **logic** red→green proven via an uncommitted Node scratch harness in `.fix-workspace/_scratch/`, evidence in PR body, see `/angular-admin`). **Admin SPA layout/CSS/visual bugs:** not trivial-skipped — build the **visual render harness** (`/angular-admin` `visual-render-harness.md`) and capture the BROKEN render (red) of the real blade against the real `platform.css`. OR trivial-skip justified (one-line null-guard / typo / off-by-one / **non-visual** template binding, no behavioral branch) — noted in PR body. **A module's embedded frontend sub-app with a REAL native test runner** (e.g. `tsx --test`) proves **state/logic** bugs red→green directly, no stub/harness needed (`/vc-shell-fix` Path 1); a **mounted-component/DOM** bug in that sub-app uses an ephemeral, never-committed vitest+`@vue/test-utils`+jsdom harness (`/vc-shell-fix` Path 2), stripped before the PR | Cannot encode in code → `FIX_STATUS: FAILED`, escalate. |
| **G3** | Fix correctness (green) | kind-routed dev — `fullstack-backend` / `fullstack-frontend` / `fix-*-agent` | Minimal diff turns the repro test **green**; **ALL pre-existing tests (and vc-frontend stories) stay green and UNMODIFIED**; BL-* / BL-UI invariants preserved; no `vc-bug-catalog` regression re-introduced. **Admin SPA layout/CSS:** the gate is a **numeric geometry measurement** (read-only `getBoundingClientRect`, `admin-spa-ui-conventions.md` §4), NOT a screenshot — a screenshot gave a false PASS on VCST-5276. `qa-backend-expert` measures the failing state (`overlapPx > 0`), then the fixed state must assert `searchrow.bottom <= gridHeader.top` (`overlapPx === 0`); the render-harness red→green screenshots are supporting evidence. When the fix changes document flow, prefer the stronger **live in-browser pre-PR verification** (apply the fix as an `@allow-eval` DOM edit on the real deployed blade → force relayout → re-measure `overlapPx === 0`) — see `/angular-admin` `visual-render-harness.md` §Live in-browser verification (with its guard: only authoritative when the relayout actually moved the dependent element). Diff uses only platform classes (`admin-spa-ui-conventions.md`); `blade-static` is fixed-height so multi-row toolbars reserve height via `__expanded`/move-content-out, never inline `ng-style`. Dev↔QA iterate ≤2× + squash | An existing test breaks → contract conflict → **STOP**, do NOT edit the test, report (human decision). |
| **G4** | Code review | kind-appropriate reviewer — `backend-reviewer` / `frontend-reviewer` (interactive) / agent self-gate + `CONFIDENCE` (CI) | Diff is single-repo (or, for a module sub-app fix, confined to the declared sub-app path), no existing-test/story edits, minimal & idiomatic (.NET 10 / Angular / Vue 3 / TS best practices), no secrets/lockfile/migration churn, no breaking prop/event/slot or contract change. **Admin SPA blade markup:** no inline `position:absolute\|fixed`, no fixed-px `width/height/left/top`, no `ng-style` height hacks — layout uses platform classes (`admin-spa-ui-conventions.md`); a layout/CSS change carries the render-harness red→green screenshots in the PR body. **Module sub-app scratch harness:** if `/vc-shell-fix`'s ephemeral harness was used, the diff carries ZERO devDependency/lockfile/scratch-config changes | `REQUEST_CHANGES` → the routed dev revises (≤2 iterations) **before** the PR is opened. Low confidence after that → skip + comment, don't PR. |
| **G5** | Build + unit CI + SonarCloud QG + auto-tests green | orchestrator (poll) | Repo build + unit tests pass — locally first (`repoProfile.buildCmd` + `testCmd` from `ci/lib/repo-router.ts`), then the **PR's GitHub Actions** = all checks `success` + `mergeable`. Wait on **both** PR jobs: (1) the build/test job — **`ci`** (`Theme CI`/`Module CI`: build + unit tests; backend adds **Swagger validation** on PRs to `dev`) **including the SonarCloud quality gate** (`Quality Gate` / `SonarCloud Code Analysis` — no new bugs / vulnerabilities / unreviewed hotspots; **new-code** coverage + duplication within thresholds), and (2) the **`auto-tests`** job — shared `pytest-tests.yml` running **`graphql, restapi, e2e`** against a real/deployed instance (a vc-frontend PR to `dev` auto-deploys to `qa` first). Plus `license/cla`. (Storybook CI is push-only — not a PR check.) | **RED → fetch + read the logs first** (`gh run view <id> --log-failed`; the failing pytest case for `auto-tests`; the PR annotations for Sonar), classify the reason, then the dev self-corrects in the same repo (≤2 iterations), re-push, re-poll. **`auto-tests` red on a touched area → fix the root cause**; unrelated/known-flaky → re-run once then note + escalate. **Sonar QG red → fix the valid findings on the changed lines** (real bug / vulnerability / security-hotspot, or add new-code coverage) within minimal-diff + never-edit-existing-tests; do NOT chase pre-existing debt or off-diff nitpicks (mark won't-fix in Sonar or note in the PR). Infra-fail / QG threshold owned by repo config → escalate (don't loop). Full reason→action table: `developers/shared-instructions.md` §After the PR. |
| **G6** | E2E / deploy verification | `qa-backend-expert` (module/platform) / `qa-frontend-expert` (vc-frontend) | **Backend is static-only in CI** — the live symptom needs a redeploy; once the PR's alpha artifact deploys to QA, `qa-backend-expert` runs `/qa-regression <module-group>` (Backend suites from `module-suite-map.md`) = pass (rerun once on a single flaky). **Frontend** logic is unit-proven, but visual / CLS aspects need a deploy — `qa-frontend-expert` runs `/qa-regression frontend` on the affected area. **Admin SPA layout/CSS** was already proven pre-PR by the render harness (G3); G6 is the final real-user confirmation once the module's alpha artifact deploys to QA. If no deploy yet, the PR is **labeled "needs deploy/visual verification"** and G6 closes post-merge via the regression pipeline + `/qa-verify-fix` | Persistent RED or cross-repo need → STOP + hand off. |
| **G7** | Human review (hard stop) | orchestrator | — | **Never auto-merge.** End with a **PR open for human review**, never merged (interactive opens a normal PR; CI opens `--draft`), and JIRA at READY FOR TEST (interactive) / In Review (CI). A human reviews and merges; post-merge verification is the separate `/qa-verify-fix VCST-XXXX`. |

---

## 1a. Ownership routing — where the PR (or issue) goes

The gate ladder is **ownership-agnostic** for G2–G6 (reproduce → fix → review → CI → E2E are identical
whatever repo the fix lives in). Ownership only changes **where the result is delivered** at G1 (PR) and
the G0 BAIL path (issue). It is **data, not judgment**: `ci/lib/repo-router.ts` `repoOwnership(repo)` and
`contributionPlan(repo)` read `project-profile.json` (written by `/project-init`). **With no profile —
the native VirtoCommerce-internal setup — every repo is `platform` / GitHub / `direct`, i.e. exactly
today's behaviour.** Both twins follow this matrix (the headless `ci/run-fix-cycle.ts` via `getVcs` /
`getUpstreamVcs` + a fork-aware `checkoutForFix`; interactive `/qa-fix` + the `developers/` team by hand):

| Routed repo | Outcome | Delivery |
|-------------|---------|----------|
| **Client** repo (custom module / theme / storefront fork) | fixable → PR | push + PR on the **client** host: GitHub (`gh pr create`) or **Azure Repos** (`vcs.clientHost` → REST `POST …/_apis/git/repositories/<repo>/pullrequests`) |
| **Platform** repo, operator = **virto-engineer** | fixable → PR | **direct** PR to `VirtoCommerce/<repo>` (today's path) |
| **Platform** repo, operator = **client** | fixable → PR | **fork** PR to `VirtoCommerce/<repo>` — branch on the client's fork (`upstream.clientGithubAccount`), head `<forkOwner>:<branch>` |
| **Platform** repo, **real but not auto-fixable** (G0 `BAIL_CLASS` = `too-complex`/`multi-repo`) | not fixable → issue | **GitHub Issue** on `VirtoCommerce/<repo>` (client just needs a GitHub account); issue-filing gated to `projectType: "client"` + `upstream.fileIssues` so native-platform never files |

**Auth (never passwords).** GitHub: a write token exported as `GH_TOKEN` (the `GITHUB_FIX_BUGS_TOKEN`
host) **or** an ambient `gh auth login` browser session (`vcs.auth: "gh-cli"` → **drop** the `GH_TOKEN=`
prefix; `gh auth status` confirms write scope). Azure Repos / Boards: `ADO_PAT` or an `az login` session
(`ADO_AUTH=az-login`). The platform upstream is **always GitHub** (public repos), so a platform fork-PR
or upstream issue uses `gh` even when the client's own code lives on Azure Repos.

### Gate 1b — frontend provenance (a client storefront is a vc-frontend fork)

`repoOwnership` routes by repo, but a **client storefront fork** contains both client-customized files
and files byte-identical to the platform — the *repo* is client, yet an individual bug may live in
**unmodified platform code**. So for a routed **client `frontend`** repo, ownership is refined from the
RCA anchor's **code provenance** (not the symptom); a platform-owned bug then takes the standard §1a
platform delivery (fork-PR contribution, or an upstream issue only on a Gate-0 too-complex bail).
This is **data, not judgment**: `ci/lib/provenance.ts` `classifyFrontendProvenance()` + `frontendDeliveryPlan()`
(shared by both twins); the fork's upstream + version anchor come from `clientUpstream(repo)`
(`repos.client[].upstream` / `upstreamRef`, derived by `/project-init`).

| RCA anchor vs `vc-frontend @ upstreamRef` | Ownership | Delivery |
|---|---|---|
| anchor exists **only** in the client repo (custom component) | **client** | fix + PR on the **client** repo |
| anchor exists in both but **differs** (customized) | **client** | fix + PR on the **client** repo |
| **byte-identical** to unmodified upstream, not fixed on upstream HEAD | **platform** | **contribute the fix upstream** — fork `vc-frontend`, fix, open a **fork-PR to VirtoCommerce** (the same platform path as a backend platform bug — the top-level §1a matrix). The client picks it up via the next release + fork sync; we do NOT patch the client fork with platform code |
| identical **and already fixed** on upstream HEAD | **platform** | **STOP-upgrade** — the client should sync the fork / upgrade the platform version, not re-fix |
| anchor missing / uncomparable | **client + LOW** | **STOP** for human routing (containment-first) |

The provenance step supplies **only the ownership**; a platform-owned frontend bug then follows the
**standard §1a platform matrix** — a **fork-PR** contributes the fix when it is auto-fixable, and an
upstream **GitHub Issue** is filed **only** when Gate 0 judged the bug too-complex / multi-repo (i.e. the
robot can't safely fix it and hands it to humans). The upstream side is a platform contribution — **never
a client-code PR** (§2a). On a **native platform** deployment there is no fork, so this sub-gate is a
no-op and a frontend bug takes the ordinary `vc-frontend` path.

---

## 2. No-auto-merge — triple guard (G7)

Merging is **always** a human action. Enforced in three independent places so no single mistake can
auto-merge:

1. **Harness:** `.claude/settings.local.json` → `permissions.deny` includes `mcp__github__merge_pull_request`
   and `Bash(gh pr merge:*)`.
2. **Orchestrator:** `/qa-fix` and `ci/run-fix-cycle.ts` never call a merge; they end at an open PR
   awaiting human review (never merged).
3. **Agent:** `fullstack-backend` / `fullstack-frontend` (LAYER 4) and the CI fix agents are forbidden `merge_pull_request` /
   `gh pr merge`; PRs are opened for human review (interactive: a normal PR; CI: `--draft`) with a
   "DO NOT MERGE until human review" body.

---

## 2a. Client-code containment — hard security invariant (NEVER leak client code upstream)

**Client code MUST NEVER leave the client's own project.** The upstream VirtoCommerce
platform / platform theme receives **contribution only** — platform-authored code fixes —
and **never** any client-owned source, in any form. This outranks every other goal: when
it conflicts with "fix the bug", the fix STOPS.

Across every gate:

- **Direction is one-way.** Client repos (custom modules, client theme, client storefront
  fork — anything `repoOwnership(repo) === "client"`) are fixed **only** on the client's
  own host (`contributionPlan` host = client GitHub / Azure Repos, mode `direct`). A client
  repo is **never** forked, PR'd, or issue-filed to `VirtoCommerce/*` or any external/public
  destination. The upstream path (fork-PR / GitHub issue) is reachable **only** for
  `repoOwnership(repo) === "platform"`.
- **No client bytes in an upstream contribution.** A platform PR / fork / issue must contain
  **only** platform code + platform-generic reproduction. The repro test, diff, PR/issue
  body, logs, and stack traces are **scrubbed of client source, file paths, identifiers,
  data, and secrets** before anything is pushed or filed to `VirtoCommerce/*`. If a bug can
  be reproduced *only* with client code, it is **not** upstream-contributable → STOP (G0/G1
  BAIL) and hand back to the client team.
- **One repo per run, no cross-checkout mixing.** A fix run touches a single repo; the
  `.fix-workspace/` clone for a platform contribution never contains client repos, and
  vice-versa. Never copy code between a client checkout and a platform checkout.
- **Misroute ⇒ STOP, containment-first.** If ownership is uncertain (a module not clearly
  under `CLIENT_ORG` / in `repos.client`, nor clearly VirtoCommerce), treat it as **client**
  and STOP for human routing — never open an upstream PR/issue on a maybe-client repo.

**Enforced (triple guard, like §2):** routing (`repoOwnership` / `contributionPlan` refuse
the upstream path for client repos) · G3/G4 (the write agent produces, and the reviewer
rejects, any client source / path / identifier in a platform diff or issue body) · the
developers team (`developers/shared-instructions.md`).

---

## 3. STOP / BAIL is a success, not a failure

A clean BAIL (G0/G1) or a reported `FIX_STATUS: FAILED` (G2–G6) is the **correct** outcome for
anything ambiguous, complex, breaking, cross-repo, or low-confidence. A wrong GO wastes reviewer
time and erodes trust in the pipeline; a BAIL just leaves the bug for a human. Every STOP must:

- leave the JIRA ticket where it was (TO DO) with a one-line reason comment,
- clone nothing further / push nothing speculative,
- return the reason to the user (interactive) or the run report (CI).

---

## 4. Reference, don't inline

| Need | Lives at |
|------|----------|
| Repo allowlist + routing hints | `ci/config/fix-repos.json` |
| Module→repo resolution, `isAllowedRepo`, `checkoutForFix`, `repoOwnership`, `computeOwnership`, `contributionPlan`, `clientUpstream`, `REPO_PROFILES` (build/test cmds) | `ci/lib/repo-router.ts` |
| Module-embedded frontend sub-app declarations (e.g. a module's Vue 3 shell) + per-sub-app resolution | `ci/config/fix-repos.json` `moduleFrontendSubApps` · `ci/lib/repo-router.ts` `resolveOwningSubApp` · `skills/vc-shell-fix/SKILL.md` |
| Frontend provenance decision (client customization vs platform bug) + delivery plan | `ci/lib/provenance.ts` (`classifyFrontendProvenance` / `frontendDeliveryPlan`) |
| Tracker/host-agnostic ops (resolve/comment/transition; live transition discovery; clone/PR matrix) | `knowledge/execution/tracker-ops.md` |
| PR/issue delivery by ownership (`getVcs` / `getUpstreamVcs`; GitHub fork-PR + issue dedup; Azure Repos PR) | `ci/lib/vcs/` |
| Deployment profile (client vs platform, tracker, VCS host, upstream) — written by `/project-init` | `project-profile.json` (gitignored) · `scripts/lib/project-profile.mjs` · `project-profile.example.json` |
| Live module dependency graph (Platform API) | `ci/lib/module-registry.ts` |
| BL-* invariants the fix must preserve | `knowledge/oracles/business-logic.md` (cite the ID) |
| Historical VC failure patterns | `knowledge/oracles/vc-bug-catalog.md` |
| VC module repo anatomy + .NET 10 / xUnit / Angular conventions | `knowledge/architecture/vc-module-architecture.md` |
| vc-frontend storefront anatomy + Vue 3 / TS / vitest / Storybook conventions | `knowledge/architecture/vc-frontend-architecture.md` |
| JIRA transitions | `skills/qa-defect/defect-lifecycle-workflow.md` |
| Reports policy + size caps | `.claude/rules/reports.md` |
