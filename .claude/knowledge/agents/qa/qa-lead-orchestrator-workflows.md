# qa-lead-orchestrator — Orchestration Workflows

> Cited by `.claude/agents/qa-lead-orchestrator.md` §Orchestration Workflows. Read it when you run one of the five workflows (feature, PR review, module, release, bug-fix verification) and the delegation steps are not already given by the invoking command. Moved verbatim.

### Orchestration Workflows

**Workflow 1: New Feature Testing**
1. Fetch ticket, analyze (7-phase protocol)
2. Transition to TESTING, comment with plan
3. Delegate test-management-specialist for test plan + cases (if needed) — cases come back as `Draft`
4. **Test case review gate (ISTQB peer review — MANDATORY)** — before execution:
   - test-management-specialist has already run `/qa-review-tests` and fixed Blockers/Criticals; they hand you the review report
   - You verify: verdict ≥ PASS WITH WARNINGS, no Blockers, any remaining Criticals are justified
   - Spot-check: requirement traceability (REQ-001), independence (C-008), P+N+B mix (TC-001) on 3-5 cases
   - Approve → the cases are appended to the target suite (`scripts/test-cases/append-test-cases-to-suite.ts`, dry-run first) then `npm run suites:sync` + `suites:lint`, never a hand-rolled CSV append. Flip status once execution has grounded them: ran green under the automated runner → `Automated`, else `Reviewed`. `/qa-test` never promotes (its cases stay `Draft`); **`qa-case-promotion` is the FULL promoter** for every source and re-derives eligibility from the CSV, never from `summary.json`. A **directly invoked** `/qa-regression` also flips already-grounded cases at **Step 6.5** from its own `RUN_ID` (same `tc:promote`, no assertion harvest, never on a run `/qa-test` delegated — `4c` passes `--no-promote`)
   - Reject → comment specific fixes, send back; do NOT proceed to execution until the gate passes
5. After cases are `Reviewed`, delegate execution in parallel: backend, frontend, ui-ux
6. Collect results, consolidate → Approve (→TESTED) / Reject (→REOPEN)

**Workflow 2: PR Review**
1. Fetch PR (`get_pull_request`, `get_pull_request_files`)
2. Scope: .cs/.js → Backend | .vue/.tsx → Frontend | .css → Styling
3. Delegate to appropriate agents, collect results, post summary to PR

**Workflow 3: Module Testing**
1. Identify scope (backend only, or backend + admin + storefront)
2. qa-backend-expert: installation, configuration, APIs, admin
3. If storefront affected: qa-frontend-expert
4. Verify no regression → approve or reject

**Workflow 4: Release Testing**
1. Hand off full regression to **regression-orchestrator** (`/qa-regression full`); supplement with targeted ui-ux + test-management checks where the orchestrator's suites don't cover
2. Consolidate the orchestrator's report + supplements, check against quality gates
3. Go/No-Go decision

**Workflow 5: Bug Fix Verification**
1. Fetch ticket, identify original bug (STR, affected area, root cause)
2. Transition to TESTING
3. Delegate test-management-specialist: generate 6-10 item verification checklist (fix confirmation + regression + cross-layer) as `Draft`. Ref: `domain-checklists.md` § BF + affected domain
4. **Review gate** — specialist runs `/qa-review-tests` on the checklist. You approve `Draft → Reviewed` (lighter spot-check than Workflow 1 given the narrow scope — confirm traceability to the bug ticket and independence). Reject → iterate
5. Delegate execution to affected-area agent(s) using the `Reviewed` checklist
6. Decision: All PASS → TESTED | Fix works but regression → REOPEN new bug | Fix fails → REOPEN with evidence
