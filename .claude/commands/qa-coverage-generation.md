---
description: "Orchestrated test coverage generation — delegates gap analysis and test case generation across domains in parallel using sub-agents. Supports CI scheduling."
argument-hint: "[p0|p1|full|domain <name>|ci-dry-run]"
disable-model-invocation: true
---

# /qa-coverage-generation — Orchestrated Coverage Generation

You are the **Coverage Generation Orchestrator** for Virto Commerce. When invoked, you analyze coverage gaps across all domains, then delegate test case generation to parallel sub-agents — each responsible for a domain batch. This is the orchestrated, multi-agent counterpart to the single-agent `/qa-coverage-gap` skill.

## Usage

```
/qa-coverage-generation                  # Default: P0 domains only (revenue-critical)
/qa-coverage-generation p0               # P0 domains: CART, CHECKOUT, PAYMENT, ORDERS, SECURITY, API-REST
/qa-coverage-generation p1               # P0 + P1 domains: adds AUTH, CATALOG, B2B, BOPIS, LISTS, CONFIG, etc.
/qa-coverage-generation full             # All domains including P2 (GA4, L10N, PERF, BROWSER)
/qa-coverage-generation domain checkout  # Single domain — no parallelism, uses /qa-coverage-gap skill directly
/qa-coverage-generation ci-dry-run       # Analyze + generate without validation or commit (CI mode)
```

### Execution Modes

- **Interactive (default):** Parallel sub-agents with browser validation for P0 cases. Full 4-cycle pipeline per batch.
- **CI mode (`ci-dry-run`):** Analysis + generation only (Cycles 1-2). No browser validation. Outputs diff-friendly report for PR review. Designed for `npm run ci:coverage`.

---

## Execution Pipeline

### Step 1 — Gap Analysis (centralized)

Run gap analysis once, centrally (do NOT delegate this):

1. Read all suite CSVs from `regression/suites/Frontend/` and `regression/suites/Backend/`
2. Read feature inventory from:
   - `.claude/agents/knowledge/business-logic.md`
   - `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`
   - `.claude/skills/vc-knowledge/vc-frontend/sitemap.md`
   - `.claude/skills/vc-knowledge/vc-api/xapi-query-ref.md`
   - `.claude/skills/testing/qa-checklist/domain-checklists.md`
   - `.claude/skills/testing/qa-coverage-gap/feature-domain-map.md`
3. Produce a gap inventory: list of `{domain, feature, gapCategory, priorityScore, targetSuite}` entries
4. Write `reports/coverage/gap-inventory-YYYY-MM-DD.json`

### Step 2 — Domain Batching

Group gaps into 3 parallel batches by domain affinity (minimize cross-suite conflicts):

| Batch | Agent | Domains | Rationale |
|-------|-------|---------|-----------|
| **Batch A** (Revenue) | `qa-frontend-expert` | CART, CHECKOUT, PAYMENT, ORDERS | Revenue-critical storefront flows |
| **Batch B** (Identity & B2B) | `qa-backend-expert` | AUTH, B2B-ORG, B2B-MEMBERS, QUOTES, LISTS, DASHBOARD | Account and B2B domain cluster |
| **Batch C** (Platform) | `qa-testing-expert` | CATALOG, SEARCH, BOPIS, CONFIG, CMS, SECURITY, API-REST, API-GQL, ADMIN-* | Platform and infrastructure |

Filter batches based on the requested scope:
- `p0`: Only gaps with priorityScore >= 8.0
- `p1`: Only gaps with priorityScore >= 5.0
- `full`: All gaps
- `domain <name>`: Skip batching, delegate to single agent

### Step 3 — Generate Run ID

Create `COV-YYYY-MM-DD-HHMM` and output directory `reports/coverage/{RUN_ID}/`.

### Step 4 — Dispatch Sub-Agents in Parallel

For each active batch:

1. Create a sub-agent (Agent tool) with:
   - The batch's assigned agent type
   - The filtered gap inventory for that batch's domains
   - Instructions to generate test cases following `coverage-gap-methodology.md` rules
   - Target suite CSV paths from `config/test-suites.json`
   - Output path: `reports/coverage/{RUN_ID}/batch-{A|B|C}-results.json`

2. Each sub-agent executes:
   - For each gap in its batch: generate test cases in TestRail CSV format
   - Append generated cases to the appropriate suite CSV
   - If `--validate` or interactive mode: validate P0 cases via browser (sub-agent uses its own browser slot)
   - Write per-batch results JSON: `{domain, casesGenerated, casesValidated, suitesModified}`

3. Browser assignment (interactive mode only):

| Batch | Browser Slot |
|-------|-------------|
| A (Revenue) | playwright-chrome |
| B (Identity) | playwright-edge |
| C (Platform) | playwright-firefox |

CI mode skips browser validation entirely.

### Step 5 — Collect & Merge Results

Wait for all batches to complete. For each:
- Read batch results JSON
- Aggregate: total gaps found, cases generated, cases validated, suites modified
- Detect conflicts: if two batches modified the same suite CSV, merge IDs sequentially

### Step 6 — Update Manifest

Update `config/test-suites.json` with new `testCount` per modified suite.

### Step 7 — Generate Report

Write `reports/coverage/{RUN_ID}/coverage-generation-report.md`:

```markdown
# Coverage Generation Report — {RUN_ID}

## Summary
- **Run date:** YYYY-MM-DD HH:MM
- **Scope:** p0 | p1 | full | domain X
- **Gaps analyzed:** N
- **Test cases generated:** N (P0: X, P1: Y, P2: Z)
- **Test cases validated:** N / M (pass rate)
- **Suites modified:** [list]
- **New suite coverage:** before% -> after%

## Batch Results
| Batch | Agent | Domains | Gaps | Cases Generated | Validated | Duration |
|-------|-------|---------|------|-----------------|-----------|----------|
| A | qa-frontend-expert | CART, CHECKOUT, ... | N | N | N/M | Xm |
| B | qa-backend-expert | AUTH, B2B, ... | N | N | N/M | Xm |
| C | qa-testing-expert | CATALOG, SEARCH, ... | N | N | N/M | Xm |

## Generated Test Cases by Domain
[Per-domain breakdown with case IDs and target suites]

## Validation Failures
[Any P0 cases that failed validation — needs-review items]

## Remaining Gaps
[Gaps not addressed in this run — blocked:test-data, requires new suite, etc.]
```

### Step 8 — CI Output (ci-dry-run mode only)

For CI integration, additionally produce:
- `reports/coverage/{RUN_ID}/summary.json` — machine-readable summary for pipeline consumption
- `reports/coverage/{RUN_ID}/diff-preview.md` — shows exactly which CSV lines would be added (for PR review)
- Exit with status: `0` if all generation succeeded, `1` if any batch failed

---

## CI Integration

### npm script

Add to `package.json`:
```json
"ci:coverage": "npx tsx ci/run-coverage.ts"
```

### Scheduled Pipeline (GitHub Actions)

```yaml
# .github/workflows/coverage-generation.yml
name: Coverage Generation
on:
  schedule:
    - cron: '0 4 * * 0'  # Weekly Sunday at 4:00 AM UTC
  workflow_dispatch:
    inputs:
      scope:
        description: 'Coverage scope'
        required: false
        default: 'p1'
        type: choice
        options: [p0, p1, full]
      dry_run:
        description: 'Dry run (no commit)'
        required: false
        default: true
        type: boolean
```

### CI Flow

1. `ci/run-coverage.ts` loads gap inventory from feature-domain-map
2. Runs Cycles 1-2 (analysis + generation) in headless mode
3. Produces `summary.json` + `diff-preview.md`
4. If not dry-run: commits changes to a `coverage/YYYY-MM-DD` branch, opens PR
5. Teams notification with coverage delta

---

## Domain Priority Groups

| Group | Domains | Priority Score |
|-------|---------|---------------|
| **P0 (Revenue)** | CART, CHECKOUT, PAYMENT, ORDERS, SECURITY, API-REST | >= 8.0 |
| **P1 (Core)** | AUTH, CATALOG, SEARCH, BOPIS, B2B-ORG, B2B-MEMBERS, QUOTES, LISTS, CONFIG, VARIATIONS, BROWSER, A11Y, CMS, API-GQL | >= 5.0 |
| **P2 (Extended)** | GA4, L10N, PERF, WL, DASHBOARD, NOTIFICATIONS, COMPARE, ADMIN-IMPERSONATION | < 5.0 |

---

## Relationship to /qa-coverage-gap Skill

| Aspect | `/qa-coverage-gap` (skill) | `/qa-coverage-generation` (command) |
|--------|---------------------------|-------------------------------------|
| Execution | Single agent, sequential | 3 parallel sub-agents |
| Scope | One domain or full (slow) | Batched by domain affinity |
| CI support | No | Yes (`ci-dry-run`, PR creation) |
| Validation | P0 via single browser | P0 via 3 browser slots |
| Best for | Quick single-domain pass | Sprint/release-level coverage improvement |

When a single domain is requested (`domain <name>`), this command delegates directly to `/qa-coverage-gap` skill — no sub-agent overhead.

---

## Rules

- Never modify suite CSVs directly — always delegate to sub-agents
- Never create new suite files without explicit user approval
- Preserve existing test case IDs — new cases get next sequential ID
- Gap analysis (Step 1) runs centrally, never in sub-agents (avoids redundant reads)
- Each sub-agent gets an isolated browser slot — never share browsers
- CI mode never opens browsers — Cycles 1-2 only
- All generated test cases must follow `coverage-gap-methodology.md` quality checklist
- If a batch fails, retry once with a different browser from fallback chain
- Write all outputs to `reports/coverage/{RUN_ID}/`, never to root
- Update `config/test-suites.json` test counts after generation
- For `ci-dry-run`: never commit, never modify CSVs, only produce reports
