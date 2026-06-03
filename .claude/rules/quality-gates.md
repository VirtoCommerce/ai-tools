# Quality Gates — Single Source of Truth

**This file is the only place the auto-fix gate ladder lives.** Both entry points reference it by
gate ID — they must never restate or diverge from these criteria:

- **Interactive:** `/qa-fix VCST-XXXX` (`.claude/commands/qa-fix.md`) + the `developers/` agent team
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
| **G0** | Fix-eligibility triage | `qa-lead-orchestrator` (interactive) / `fix-triage-agent` (CI) | **Simple, low-risk, code-fixable defect:** clear STR + clear expected-vs-actual; localized root cause (single bounded code site); small estimated diff; **no refactoring**; **no breaking changes** (no public REST/GraphQL/DTO/contract change, no DB schema/migration, no domain-event/manifest change); BL-* preserved; **not** by-design / config-gated / env-data-drift / API-only-repro / security-disclosure / no-STR | **BAIL before clone.** Comment ticket out-of-auto-fix-scope + reason; leave at TO DO; hand off. *When in doubt, BAIL.* |
| **G1** | Single target repo | orchestrator (validated by `isAllowedRepo`) | Resolves to **exactly one** allowed repo: a `vc-module-*` (C# and/or its Admin SPA UI), `vc-module-x-*` (xAPI), `vc-platform`, or `vc-frontend`. Owning layer ∈ {REST L4, xAPI L3, Admin-SPA L2 in the module repo}; `/qa-fix` backend scope excludes a pure `vc-frontend` (Vue) storefront bug | **STOP.** Multi-repo / cross-module / off-allowlist → comment + hand off (`ROUTE_REPO` rejected). Never guess. |
| **G2** | Reproduction (red) | `fullstack-backend` (interactive) / `fix-*-agent` (CI) | A **new** unit test encodes the STR/RCA and **fails on current code** (xUnit for C#; vitest for vc-frontend; Jasmine/Karma for module Admin UI). OR trivial-skip justified (one-line null-guard / typo / off-by-one, no behavioral branch) — noted in PR body | Cannot encode in code → `FIX_STATUS: FAILED`, escalate. |
| **G3** | Fix correctness (green) | `fullstack-backend` / `fix-*-agent` | Minimal diff turns the repro test **green**; **ALL pre-existing tests stay green and UNMODIFIED**; BL-* invariants preserved; no `vc-bug-catalog` regression re-introduced | An existing test breaks → contract conflict → **STOP**, do NOT edit the test, report (human decision). |
| **G4** | Code review | `backend-reviewer` (interactive) / agent self-gate + `CONFIDENCE` (CI) | Diff is single-repo, no existing-test edits, minimal & idiomatic (.NET 10 / Angular / Vue best practices), no secrets/lockfile/migration churn | `REQUEST_CHANGES` → `fullstack-backend` revises (≤2 iterations) **before** the PR is opened. Low confidence after that → skip + comment, don't PR. |
| **G5** | Build + unit CI green | orchestrator (poll) | Repo build + unit tests pass — locally first (`repoProfile.buildCmd` + `testCmd` from `ci/lib/repo-router.ts`), then the **PR's GitHub Actions** = all checks `success` + `mergeable` | Code-fail → self-correct in the same repo (≤2 iterations), re-push, re-poll. Infra-fail → escalate (don't loop). |
| **G6** | E2E / deploy verification | `qa-backend-expert` | **Backend is static-only in CI** — the live symptom needs a redeploy. Once the PR's alpha artifact deploys to QA, `qa-backend-expert` runs `/qa-regression <module-group>` (Backend suites from `module-suite-map.md`) = pass (rerun once on a single flaky). If no deploy yet, the PR is **labeled "needs deploy verification"** and G6 closes post-merge via the regression pipeline + `/qa-verify-fix` | Persistent RED or cross-repo need → STOP + hand off. |
| **G7** | Human review (hard stop) | orchestrator | — | **Never auto-merge.** End with a **PR open for human review**, never merged (interactive opens a normal PR; CI opens `--draft`), and JIRA at READY FOR TEST (interactive) / In Review (CI). A human reviews and merges; post-merge verification is the separate `/qa-verify-fix VCST-XXXX`. |

---

## 2. No-auto-merge — triple guard (G7)

Merging is **always** a human action. Enforced in three independent places so no single mistake can
auto-merge:

1. **Harness:** `.claude/settings.local.json` → `permissions.deny` includes `mcp__github__merge_pull_request`
   and `Bash(gh pr merge:*)`.
2. **Orchestrator:** `/qa-fix` and `ci/run-fix-cycle.ts` never call a merge; they end at an open PR
   awaiting human review (never merged).
3. **Agent:** `fullstack-backend` (LAYER 4) and the CI fix agents are forbidden `merge_pull_request` /
   `gh pr merge`; PRs are opened for human review (interactive: a normal PR; CI: `--draft`) with a
   "DO NOT MERGE until human review" body.

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
| Module→repo resolution, `isAllowedRepo`, `checkoutForFix`, `REPO_PROFILES` (build/test cmds) | `ci/lib/repo-router.ts` |
| Live module dependency graph (Platform API) | `ci/lib/module-registry.ts` |
| BL-* invariants the fix must preserve | `.claude/agents/knowledge/business-logic.md` (cite the ID) |
| Historical VC failure patterns | `.claude/agents/knowledge/vc-bug-catalog.md` |
| VC module repo anatomy + .NET 10 / xUnit / Angular conventions | `.claude/agents/knowledge/vc-module-architecture.md` |
| JIRA transitions | `.claude/skills/qa-methodology/qa-defect/defect-lifecycle-workflow.md` |
| Reports policy + size caps | `.claude/rules/reports.md` |
