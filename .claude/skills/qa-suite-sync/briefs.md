# qa-suite-sync — dispatch briefs

Supporting file for [`qa-suite-sync`](SKILL.md). Read it before each dispatch.

## Delegation Protocol

**Phases 2-4** — Dispatch to `test-management-specialist` as a single delegation:

```
Delegate to: test-management-specialist
Input:
  - scope: [suite IDs from Phase 1]
  - changeInventory: [from Phase 1, if change-driven]
  - models: {per domain: domainMap|mindMap|dataModel present or missing, suspects, uncovered nodes,
    caseless crossings — from models.md §Phase 1}
  - phases: [2,3,4] (for a suite/domain input, Phase 2 only on models.suspects, else none; on a re-dispatch, the phases the approved items belong to,
    plus 4 whenever it writes or rewrites a case — 4a/4b review every case the re-dispatch writes)
  - preflight: {the /preflight block's kb hits + doc hits}
  - approved: [items the user approved — pendingApprovals and 4a-bis DRIFT rewrites with their evidence; apply exactly
    these. Removals and deprecations are never here: the orchestrator writes them with retire.ts]   // second dispatch only
  - stampRefreshes: [4a-bis CONFIRMED cases — refresh their stamp, no approval needed]   // second dispatch only
  - harvest: {runId, env, date, verdicts: [{caseId, verdict}]} — verify.md 5c: in each PASSED case, retag every
    {HYPOTHESIS} / unconfirmed {SPEC} assertion {OBSERVED} (<env> <date>, <runId>) with the cell editor, tags only,
    then 4a on those suites; FAILED/BLOCKED cases untouched   // harvest dispatch only, phases: [4]
  - proofLane: `playwright-chrome` — this agent's lane (`.claude/rules/agents.md` §Parallel Execution — Browser Assignments),
    so no qa-frontend-expert dispatch may run beside it; API-only proofs need no lane. Plus the env and
    the shared windows that are NOT open, so those cases are NEEDS_WINDOW   // second dispatch only
  - you cannot ask the user: anything this skill says to confirm or present for approval (2c remove/deprecate/rewrite,
    the 3c Feature Test Matrix, 4b manual items) → return it in pendingApprovals[]
    and do NOT write it.
  - Observed behaviour: paste the "Observed behaviour" paragraph of `.claude/templates/agent-dispatch.md`
    §Agent Prompt Structure verbatim
  - build:
    - platform: {PlatformVersion from packages.json}
    - theme: {theme version from artifact.json}
    - relevant_modules: {module-name: version}
  - environment:
    - frontend: {FRONT_URL}
    - backend: {BACK_URL}
  - procedure — read whole before you start: .claude/skills/qa-suite-sync/models.md, sync.md (Phase 2), generate.md (Phase 3),
    review.md (Phase 4: 4a and 4b — 4a-bis and 4c are the orchestrator's; return their candidates in
    triangulationCandidates[] and blProposals)
  - references:
    - config/test-suites.json (suite definitions)
    - regression/suites/ (target CSV files)
    - .claude/skills/qa-review-tests/SKILL.md (canonical dimension set — do not restate it)
    - .claude/skills/qa-review-tests/review-criteria.md
    - .claude/skills/qa-test-cases-generator/test-case-template.md (column contract + Automation_Status meanings)
    - npm run bl:extract (BL-*)
    - .claude/knowledge/oracles/e-commerce-edge-cases-library.md
    - .claude/knowledge/domain/products.md
    - .claude/knowledge/execution/module-suite-map.md
    - .claude/knowledge/domain/sitemap.md
    - .claude/skills/qa-checklist/domain-checklists.md
    - .claude/skills/qa-checklist/backend-admin-checklists.md
    - .claude/skills/qa-checklist/graphql-checklist.md
    - .claude/skills/qa-coverage-gap/feature-domain-map.md
    - .claude/knowledge/api/graphql-schema.md (for GraphQL scopes)
  - VirtoOZ (connector; Context7 fallback), after the kb: domain-specific module behavior

Output: structured JSON with:
  - syncResults: [{caseId, classification, action, before, after}]
  - gapInventory: [{domain, feature, priority, layers}]
  - generatedCases: [{caseId, title, suite, layer, priority}]
  - reviewFindings: [{caseId, dimension, severity, issue, suggestedFix}]
  - fixesApplied: [{caseId, issue, fixAction}]
  - manualItems: [{caseId, issue, dimension}]
  - pendingApprovals: [{caseId, phase, action: remove|deprecate|rewrite|author|fix|manual, diff, reason}]   // unwritten
  - triangulationCandidates: [{caseId, suiteCsv, assertion, why}]   // 4a-bis — the orchestrator triangulates
  - nodesChanged: [{node, map, what changed, cases}]   // for /qa-test-mind-map update — the map is never edited here
  - stampsWritten: [{caseId, behavior, dataProfile}]
  - proofResults: [{caseId, proof: PASS|CASE_DEFECT|REFUTED|NEEDS_WINDOW, fixed, runIds, teardown}]   // re-dispatch
  - bugCandidates: [{caseId, assertion, observed}]   // REFUTED proofs — the orchestrator puts them to the user
  - kbEntries: {read: [ids], confirmed: [ids], disputed: [ids], captured: [ids]}
  - blProposals (candidates surfaced this run, fed to Phase 4c): {new: [{proposedId, severity, rule, verify, violationSignal, agents, source, triggeredByCases}], stale: [{id, observedBehavior, affectedCases, bug}]}
  - statistics: {totalCases, synced, generated, findings, autoFixed, manualRemaining}
  - filesModified: [paths]
```

When `pendingApprovals[]` or 4a-bis has anything for the user: put it to them as one list, then dispatch again
with `approved` (minus removals and deprecations), `stampRefreshes`, and `phases` limited to the phases those
items belong to. Unapproved items are reported, not written.

**Phase 5a** — the scoped run, no brief of yours: `/qa-regression <suite ids> --ids <every new or changed
case id> --no-promote` on the bound env (`verify.md` 5a). Keep its `RUN_ID` and per-case verdicts for 5c,
step 7 and promotion.

**Phase 5b** — Dispatch to `qa-testing-expert`, after 5a, only for what a case run cannot see (`verify.md` 5b):

```
Delegate to: qa-testing-expert
Input:
  - pageChecks: [{url, elementsToCheck}]  // reachability, console baseline, label drift on EXISTING cases
  - stalenessChecks: [{caseId, reclassification, elementToVerify}]  // Phase 2 reclassifications of cases NOT changed
  - the targets are not yours: 5a executed them; do not re-run them
  - Observed behaviour: paste the "Observed behaviour" paragraph of `.claude/templates/agent-dispatch.md`
    §Agent Prompt Structure verbatim
  - file nothing: a finding goes back in the output, never to a tracker
  - build: {platform, theme, relevant_modules}
  - browser: playwright-firefox (fallback: playwright-edge)
  - environment: {frontend: FRONT_URL, backend: BACK_URL}
  - maxPages: 20
  - timeoutPerPage: 60s
  - totalBudget: 5min
  - evidence: follow `.claude/skills/qa-evidence/evidence-capture-policy.md`

Output: per item:
  - VERIFIED: page loads, elements found
  - CHANGED: element missing/renamed — include screenshot + actual label
  - BROKEN: page error, redirect loop, critical JS errors — include screenshot
  - BLOCKED: precondition can't be met (login fail, feature disabled)
  - UNCHECKED: a cap ran out before this item — never report it as verified (`verify.md`)
  - kbEntries: {read, confirmed, disputed, captured}
```

---
