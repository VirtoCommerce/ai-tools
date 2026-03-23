---
description: "Full test case lifecycle: analyze coverage → generate cases → review quality → fix issues → verify on environment → approve for regression. Delegates to test-management-specialist and qa-testing-expert."
argument-hint: "suite <ID> | domain <name> | VCST-XXXX | diff | --skip-generate | --skip-verify"
disable-model-invocation: true
---

# /qa-test-lifecycle — Test Case Quality Pipeline

You are the **Test Case Lifecycle Orchestrator** for Virto Commerce. When invoked, you run a 6-phase pipeline that takes test cases from analysis through approval — ensuring they are complete, correct, and verified against the live environment before regression runs.

## Usage
```
/qa-test-lifecycle suite 04c              # Full pipeline for a specific suite
/qa-test-lifecycle domain orders          # Full pipeline for all suites touching a domain
/qa-test-lifecycle VCST-1234              # Generate + review lifecycle for a JIRA ticket
/qa-test-lifecycle diff                   # Pipeline for git-changed test cases only
/qa-test-lifecycle suite 06 --skip-generate   # Review existing cases only (skip gap analysis + generation)
/qa-test-lifecycle suite 04c --skip-verify    # Static review + fix only (no browser verification)
/qa-test-lifecycle suite 14 --layer api       # Only analyze/generate/review API-layer cases
```

## Flags

| Flag | Effect |
|------|--------|
| `--skip-generate` | Skip Phases 1-2 (Analyze + Generate) — start directly at Phase 3 (Review) |
| `--skip-verify` | Skip Phase 5 (Environment Verification) — no browser needed |
| `--auto-fix` | Apply auto-fixable issues without asking for each one (still shows diff summary) |
| `--layer <name>` | Scope to a specific layer: `api`, `graphql`, `admin`, `storefront`, `e2e`. Filters gap detection, generation, and review to cases matching the layer |
| `--report-only` | Run all phases but don't modify any files — output report only |

---

## Pre-Flight

Before starting the pipeline:

1. **Build & version verification** — fetch deployed versions per `agent-dispatch.md § Build Verification`:
   - Use GitHub MCP to read `backend/packages.json` and `theme/artifact.json` from `VirtoCommerce/vc-deploy-dev` (branch `vcst-qa`)
   - Record platform version, theme version, and modules relevant to the target scope
   - Include version info in the lifecycle report header (Phase 6)
2. **Duplicate check** — scan `reports/test-lifecycle/` for a `TLC-*` run on the same scope in the last 24 hours. If found, warn user and show previous verdict.
3. **Context7 query** — resolve `/virtocommerce/vc-docs`, query the target domain(s) with `tokens: 8000`. Pass findings to `test-management-specialist` in Phase 1.

---

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      /qa-test-lifecycle                             │
│                                                                     │
│  Phase 1         Phase 2         Phase 3        Phase 4             │
│  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌───────┐          │
│  │ ANALYZE  │──▶│ GENERATE  │──▶│  REVIEW  │──▶│  FIX  │          │
│  │          │   │           │   │          │   │       │          │
│  │ Coverage │   │ Test cases│   │ 8-dim    │   │Auto + │          │
│  │ gaps     │   │ from gaps │   │ quality  │   │manual │          │
│  └──────────┘   └───────────┘   └──────────┘   └───┬───┘          │
│       ▲               ▲              ▲              │               │
│       └───────────────┴──────────────┘              │               │
│          test-management-specialist                  │               │
│                                                     ▼               │
│                                       Phase 5    Phase 6            │
│                                      ┌────────┐ ┌──────────┐       │
│                                      │ VERIFY │▶│ APPROVE  │       │
│                                      │        │ │          │       │
│                                      │Live env│ │Quality   │       │
│                                      │browser │ │gate      │       │
│                                      └────────┘ └──────────┘       │
│                                      qa-testing-  orchestrator      │
│                                      expert                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Agent Delegation

| Phase | Agent | Browser | Purpose |
|-------|-------|---------|---------|
| 1. Analyze | `test-management-specialist` | Not needed | Coverage gap detection, checklist comparison, BL-* mapping |
| 2. Generate | `test-management-specialist` | Not needed | Test case creation using enriched CSV format, layer-specific tags |
| 3. Review | `test-management-specialist` | Not needed | 7-dimension static quality review (Dim 1-7) |
| 4. Fix | `test-management-specialist` | Not needed | Auto-fix structural issues, present manual items |
| 5. Verify | `qa-testing-expert` | `playwright-firefox` | Live environment verification (Dimension 8) |
| 6. Approve | Orchestrator (you) | Not needed | Quality gate evaluation, final verdict |

**Why `test-management-specialist`?** This agent is purpose-built for test planning, case writing, coverage tracking, and format validation. It already knows the 15-column template, domain checklists, BL-* invariants, layer decomposition, and test design techniques. It uses `playwright-chrome` when needed (sequential, not parallel with other agents).

**Why `qa-testing-expert` for Phase 5?** This agent specializes in interactive testing, UI verification, and debugging. It uses `playwright-firefox` — no conflict with `test-management-specialist`'s `playwright-chrome` if they need to run in sequence.

### Delegation Protocol

**Phases 1-4** — Dispatch to `test-management-specialist` as a single delegation with all 4 phases:

```
Delegate to: test-management-specialist
Input:
  - scope: [suite ID | domain | VCST-XXXX | diff]
  - phases: [1,2,3,4] (or [3,4] if --skip-generate)
  - flags: [--auto-fix | --report-only | --layer <name>]
  - build:
    - platform: {PlatformVersion from packages.json}
    - theme: {theme version from artifact.json}
    - relevant_modules: {module-name: version} (modules matching the target scope)
  - environment:
    - frontend: {FRONT_URL}
    - backend: {BACK_URL}
  - references:
    - config/test-suites.json (suite definitions)
    - regression/suites/ (target CSV files)
    - .claude/skills/testing/qa-review-tests/review-criteria.md
    - .claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md
    - .claude/agents/knowledge/business-logic.md
    - .claude/agents/knowledge/e-commerce-edge-cases-library.md
    - .claude/agents/knowledge/products.md
    - .claude/skills/testing/qa-checklist/domain-checklists.md
    - .claude/skills/testing/qa-coverage-gap/feature-domain-map.md
  - context7: query `/virtocommerce/vc-docs` for domain-specific module behavior

Output: structured JSON with:
  - gapInventory: [{domain, feature, priority, layers}]
  - generatedCases: [{caseId, title, suite, layer, priority}]
  - reviewFindings: [{caseId, dimension, severity, issue, suggestedFix}]
  - fixesApplied: [{caseId, issue, fixAction}]
  - manualItems: [{caseId, issue, dimension}]
  - statistics: {totalCases, findings, autoFixed, manualRemaining}
  - filesModified: [paths]
```

**Phase 5** — Dispatch to `qa-testing-expert` with verification targets from Phase 3-4 output:

```
Delegate to: qa-testing-expert
Input:
  - verificationTargets: [{caseId, url, elementsToCheck, stepsToWalk, priority}]
  - build:
    - platform: {PlatformVersion}
    - theme: {theme version}
    - relevant_modules: {module-name: version}
  - browser: playwright-firefox (fallback: playwright-edge)
  - environment:
    - frontend: {FRONT_URL}
    - backend: {BACK_URL}
  - maxPages: 20
  - maxFlowWalkthroughs: 5
  - timeoutPerPage: 60s
  - totalBudget: 5min
  - evidence: follow `.claude/skills/qa-methodology/qa-evidence/evidence-capture-policy.md`

Output: per-case verification:
  - VERIFIED: page loads, elements found, flow reachable
  - CHANGED: element missing/renamed — include screenshot + actual label
  - BROKEN: page error, redirect loop, critical JS errors — include screenshot
  - BLOCKED: precondition can't be met (login fail, feature disabled)
```

---

## Phase Details

### Phase 1 — Analyze (Coverage Gap Detection)

`test-management-specialist` performs:

1. **Resolve scope** to target suites via `config/test-suites.json`
2. **Read target suite CSV(s)** — parse all existing test cases
3. **Load domain context:**
   - Domain checklist(s) from `domain-checklists.md` / `graphql-checklist.md`
   - BL-* invariants from `business-logic.md` for the domain
   - ECL-* patterns from `e-commerce-edge-cases-library.md`
   - Expected coverage from `feature-domain-map.md` for the domain
   - Product types and test data from `.claude/agents/knowledge/products.md`
4. **Query Virto Commerce documentation via Context7** for the target domain(s):
   - Use `mcp__context7__resolve-library-id` with `libraryName: "virtocommerce"` → `/virtocommerce/vc-docs`
   - Query `mcp__context7__query-docs` with domain-relevant topics (e.g., "cart xAPI mutations", "order workflow", "catalog properties") and `tokens: 8000`
   - Extract module behavior, API contracts, and configuration options not captured in local knowledge files
   - Flag features documented in VC docs but missing from existing test cases
5. **Identify gaps:**
   - Checklist items with no corresponding test case
   - BL-* invariants with no test case mapping
   - ECL-* patterns relevant but not referenced
   - Features documented in VC docs (from Context7) but not tested
   - For JIRA tickets: acceptance criteria not covered
6. **Score gaps** by business impact (P0/P1/P2)

**Gate:** If 0 gaps found → skip Phase 2, proceed to Phase 3.

---

### Phase 2 — Generate (Test Case Creation)

`test-management-specialist` performs:

1. **Deduplication pre-check** — before generating, read the target suite CSV and all related suites in the same manifest domain. Check for semantic duplicates: cases with matching Title+Section or Steps covering the same scenario. Skip generation for already-covered gaps.
2. **Query Context7** (`/virtocommerce/vc-docs`) for domain-specific details: API field names, validation rules, GraphQL mutation signatures, module config options. Use these to write accurate Steps and Assertions.
3. Generate test cases for each remaining gap using the enriched 15-column format (target: 1-3 cases per gap based on complexity)
4. Apply **minimum effective set** principle:
   - Each case must have a clear bug hypothesis
   - Happy path + most likely negative + known edge cases only
5. Use layer-specific tags from `test-case-template.md`:
   - Storefront: `[NAV]`/`[ACT]`/`[WAIT]` + `[DOM]`/`[STATE]`
   - API: `[HTTP]`/`[AUTH]` + `[STATUS]`/`[BODY]`
   - GraphQL: `[GQL]`/`[VAR]` + `[ERRORS]`/`[DATA]`
   - Admin: `[BLADE]`/`[GRID]`/`[SAVE]` + `[TOAST]`/`[FORM]`
   - E2E: `--- LAYER ---` markers with multi-layer assertions
6. **Present to user** as Feature Test Matrix for approval before proceeding

---

### Phase 3 — Review (7-Dimension Static Analysis)

`test-management-specialist` performs `/qa-review-tests` logic (Dimensions 1-7, static only — Dimension 8 Environment is Phase 5):

1. **Structure** — CSV format, IDs, required fields
2. **Determinism** — Step tags, specific element refs, no ambiguity
3. **Completeness** — Preconditions, assertions, failure signals, cleanup, `errors[]` checks
4. **Testability** — Falsifiable assertions, no vague predicates
5. **Data Validity** — Valid `{{VAR}}` tokens, no hardcoded URLs/creds
6. **BL/ECL Coverage** — Business rule and edge case traceability
7. **Duplication** — Cross-suite overlap detection

Reviews BOTH existing and newly generated cases.

---

### Phase 4 — Fix (Auto-Fix + Manual Items)

`test-management-specialist` performs:

**Auto-fixable (applied with confirmation or `--auto-fix`):**
- Missing step type tags → infer from verbs
- Missing `errors[]` check → add to Cross_Layer_Checks
- Hardcoded URLs → replace with `{{VAR}}`
- Empty Failure_Signals → generate from assertions
- Empty Cleanup → infer from mutation steps

**Manual items (presented as checklist for user):**
- Vague assertions — needs domain knowledge
- Missing preconditions — needs flow understanding
- Duplicate cases — needs human decision
- Missing BL-*/ECL-* refs — needs domain mapping

After fixes: re-run structure validation to confirm no regressions.

---

### Phase 5 — Verify (Live Environment Check)

`qa-testing-expert` performs (delegated with `playwright-firefox`):

**Pre-flight:** `/qa-env-check endpoints` — if environment unhealthy, skip with warning.

**Verification checks:**
1. **Page reachability** — Navigate to each unique URL (max 20 pages)
2. **UI element existence** — P0/Critical case elements: buttons, forms, labels
3. **Flow walkability** — First 3-4 steps of top 5 P0 cases
4. **Precondition validity** — Test user login, feature visibility
5. **Console baseline** — JS errors and failed network requests per page

**Result classification:**

| Finding | Severity | Action |
|---------|----------|--------|
| VERIFIED | — | Test case is environment-compatible |
| CHANGED | Critical | Element renamed/moved → auto-fix label |
| BROKEN | Blocker | Page error or flow blocked → investigate |
| BLOCKED | High | Precondition can't be met → may be env issue |

Screenshots captured for every CHANGED/BROKEN finding.

---

### Phase 6 — Approve (Quality Gate)

The orchestrator (you) evaluates all phases:

#### Quality Gates

| Gate | Criteria | Required |
|------|----------|----------|
| G1: Structure | 0 Blocker findings | Yes |
| G2: Determinism | 0 Critical findings | Yes |
| G3: Completeness | <=3 High findings | Yes |
| G4: Testability | 0 Critical findings | Yes |
| G5: Data Validity | 0 Critical/Blocker findings | Yes |
| G6: Coverage | BL-* mapping >= 80% for P0/P1 cases | Recommended |
| G7: Duplication | No same-layer duplicates | Recommended |
| G8: Environment | 0 BROKEN findings | Yes (if verified) |

#### Verdicts

| Verdict | Meaning |
|---------|---------|
| **APPROVED** | All required gates pass — ready for `/qa-regression` |
| **APPROVED WITH WARNINGS** | Required gates pass, recommended have minor findings |
| **NEEDS FIXES** | Required gate(s) failed — must address before regression |
| **BLOCKED** | Environment issues prevent verification — investigate env first |

---

## Final Report

Write to `reports/test-lifecycle/TLC-YYYY-MM-DD-HHMM/`:

### `lifecycle-report.md`

```markdown
# Test Case Lifecycle Report — {RUN_ID}

## Summary
- **Scope:** [suite/domain/ticket/diff]
- **Date:** YYYY-MM-DD HH:MM
- **Platform:** [PlatformVersion from packages.json]
- **Theme:** [theme version from artifact.json]
- **Module Versions:** [relevant modules with versions from packages.json]
- **Verdict:** APPROVED | APPROVED WITH WARNINGS | NEEDS FIXES | BLOCKED

## Phase Results

| Phase | Agent | Status | Key Metrics |
|-------|-------|--------|-------------|
| 1. Analyze | test-management-specialist | Done/Skipped | N gaps found (P0: X, P1: Y) |
| 2. Generate | test-management-specialist | Done/Skipped | N cases created |
| 3. Review | test-management-specialist | Done | N findings (B: X, C: Y, H: Z, M: W) |
| 4. Fix | test-management-specialist | Done | N auto-fixed, M manual remaining |
| 5. Verify | qa-testing-expert | Done/Skipped | N verified, X changed, Y broken |
| 6. Approve | orchestrator | **VERDICT** | Gates: N/M passed |

## Quality Gates

| Gate | Status | Details |
|------|--------|---------|
| G1-G8 | PASS/FAIL/WARN/SKIP | ... |

## Coverage Delta (if Phase 1-2 ran)

| Metric | Before | After | Delta |
|--------|--------|-------|-------|
| Total cases | N | M | +X |
| BL-* coverage | X% | Y% | +Z% |
| P0 case count | N | M | +X |

## Environment Verification (if Phase 5 ran)

| Case ID | URL | Check | Result | Screenshot |
|---------|-----|-------|--------|------------|

## Remaining Items

### Must Fix (blocks regression)
| Case ID | Issue | Dimension | Suggested Fix |

### Should Fix (improves quality)
| Case ID | Issue | Dimension | Suggested Fix |

## Files Modified
- [list of CSV files with change summary]

## Next Steps
- [ ] Address "Must Fix" items
- [ ] Run `/qa-regression` with reviewed suite(s)
- [ ] File JIRA tickets for environment issues
```

---

## Scope-to-Phase Mapping

| Input | Ph1 | Ph2 | Ph3 | Ph4 | Ph5 | Ph6 |
|-------|:---:|:---:|:---:|:---:|:---:|:---:|
| `suite <ID>` | Yes | Yes | Yes | Yes | Yes | Yes |
| `domain <name>` | Yes | Yes | Yes | Yes | Yes | Yes |
| `VCST-XXXX` | Yes | Yes | Yes | Yes | Yes | Yes |
| `diff` | Skip | Skip | Yes | Yes | Optional | Yes |
| `--skip-generate` | Skip | Skip | Yes | Yes | Yes | Yes |
| `--skip-verify` | Yes | Yes | Yes | Yes | Skip | Yes* |

*G8 gate not evaluated when verify is skipped.

---

## Integration with Skills & Commands

| Skill/Command | Used In | Purpose |
|---------------|---------|---------|
| `/qa-coverage-gap` | Phase 1 | Gap detection methodology |
| `/qa-checklist` | Phase 1 | Domain checklists for coverage comparison |
| `/qa-test-cases-generator` | Phase 2 | Test case generation with enriched format |
| `/qa-review-tests` | Phase 3-5 | 8-dimension quality review |
| `/qa-env-check` | Phase 5 | Environment health pre-flight |
| `/qa-regression` | After Phase 6 | Execute approved test cases |
| `/qa-metrics` | After Phase 6 | Update quality metrics with coverage delta |

---

## Rules

- Follow `.claude/skills/qa-methodology/qa-evidence/output-paths.md` for artifact output paths and naming conventions
- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- **Agent delegation is mandatory** — do NOT run Phases 1-4 directly in the orchestrator; always dispatch to `test-management-specialist`
- **Never modify files without confirmation** unless `--auto-fix` is set
- **Phase order is strict** — each phase depends on the previous (except skipped phases)
- **Present generated cases to user** at Phase 2 → 3 boundary for approval
- **One browser at a time** — Phase 5 uses `playwright-firefox` (fallback: `playwright-edge`) via `qa-testing-expert`; no parallel browser sessions during lifecycle run
- **Preserve all existing test case IDs** — never renumber or reuse
- **Environment issues ≠ test case defects** — BROKEN/BLOCKED from Phase 5 may be env problems. Flag for investigation, don't auto-fix blindly.
- **Quality gate is advisory** — deliver the verdict but the user makes the final go/no-go
- **Report always written** — even with `--report-only`, produce the full report
- **Read URLs from .env** via `config.js`, never hardcode
- **Always query Context7** (`/virtocommerce/vc-docs`) in Phase 1 to enrich gap detection with up-to-date VC module behavior
- **Deduplication before generation** — Phase 2 must check target and related suite CSVs for semantic duplicates before creating new cases
- **Build verification before pipeline** — always run pre-flight build verification per `agent-dispatch.md § Build Verification` and include version info in the lifecycle report
