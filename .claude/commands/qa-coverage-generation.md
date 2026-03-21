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

1. Read all suite CSVs referenced in `config/test-suites.json` (paths in `file` field). Suites are organized by `domain`, `layer`, and `concern` fields for routing.
2. Read **original TestRail exports** from `test-suites ( export from Test-rail )/` as baseline reference:
   - `Frontend/Frontend26-02.csv.csv` — latest frontend test cases (Sprint 26-02)
   - `Frontend/frontend-26-01.csv` — previous frontend baseline (Sprint 26-01)
   - `Frontend/suites/` — categorized frontend suites (auth, catalog, cart, checkout, BOPIS, orders, lists, B2B, analytics, UI/UX, l10n)
   - `Backend (admin site)/` — backend module exports (Catalog, Store, Pricing, Orders, Customer, Inventory, Marketing, etc.)
   - `E2E/` — end-to-end test imports (configurable products)
   These exports represent the **original test inventory from TestRail** — use them to identify test cases that exist in TestRail but are missing or incomplete in the current regression suites, and to preserve original test intent during gap generation.
3. Read feature inventory from:
   - `.claude/agents/knowledge/business-logic.md`
   - `.claude/agents/knowledge/e-commerce-edge-cases-library.md`
   - `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`
   - `.claude/agents/knowledge/sitemap.md`
   - `.claude/skills/testing/qa-api/xapi-query-ref.md`
   - `.claude/agents/knowledge/module-suite-map.md`
   - `.claude/skills/testing/qa-checklist/domain-checklists.md`
   - `.claude/skills/testing/qa-api/test-cases-api-graphql.md`
   - `.claude/skills/testing/qa-coverage-gap/feature-domain-map.md`
   - `.claude/skills/qa-methodology/qa-test-design/SKILL.md`
   - `.claude/skills/qa-methodology/qa-test-cases-generator/SKILL.md`
4. **Query Virto Commerce documentation via Context7** for each domain in scope:
   - Use `mcp__context7__resolve-library-id` with `libraryName: "virtocommerce"` to get the library ID (`/virtocommerce/vc-docs`)
   - For each domain (CART, CHECKOUT, CATALOG, etc.), query `mcp__context7__query-docs` with domain-relevant topics (e.g., "cart mutations xAPI", "order processing workflow", "catalog search indexing") and `tokens: 8000`
   - Extract module-specific behavior, API contracts, configuration options, and edge cases not captured in local knowledge files
   - Use documentation findings to enrich the gap inventory — flag features documented in VC docs but not covered by existing test cases
5. Produce a gap inventory: list of `{domain, feature, gapCategory, priorityScore, applicableLayers[], targetSuites[]}` entries
   - For each gap, determine applicable layers: does the feature have REST endpoints? → `api`. GraphQL ops? → `graphql`. Admin UI? → `admin`. Storefront? → `storefront`. Spans ≥2? → `e2e`
6. Write `reports/coverage/gap-inventory-YYYY-MM-DD.json`

### Step 2 — Domain Batching & Layer Assignment

Group gaps into 3 parallel batches by manifest domain affinity. Each batch generates **layer-specific test cases** using `--layer`:

| Batch | Agent | Manifest Domains | Suites | Layers Generated |
|-------|-------|-----------------|--------|-----------------|
| **Batch A** (Revenue & Storefront) | `qa-frontend-expert` | `purchase-flow`, `marketing` | 04a-06, 19-20, 22, 30, 37, 41-42 (frontend); 05 (BOPIS) | `storefront` + `graphql` + `e2e` |
| **Batch B** (Identity, B2B & Comms) | `qa-backend-expert` | `auth-security`, `customer-b2b`, `communication` | 02, 08, 13-14, 17, 21, 24, 33, 38-39 | `api` + `graphql` + `admin` + `e2e` |
| **Batch C** (Platform & Content) | `qa-testing-expert` | `catalog-search`, `platform-config`, `content-cms`, `branding`, `cross-cutting` | 01, 03, 07, 09-12, 15-16, 18, 25-29, 31-32, 34-36, 40 | `api` + `graphql` + `admin` |

### Manifest Domain → Batch Routing

| Manifest Domain | Batch | Feature Areas |
|----------------|-------|---------------|
| `purchase-flow` | A | Cart, Checkout, Payment, Orders, BOPIS, Pricing, Inventory, Shipping, Returns |
| `marketing` | A | Promotions, Coupons, xMarketing |
| `auth-security` | B | Authentication, Security, Platform API, Platform Core |
| `customer-b2b` | B | B2C Features, Customer Admin, Contracts, Loyalty |
| `communication` | B | Notifications, Push Messages |
| `catalog-search` | C | Catalog, Search, CSV Import/Export, Configurable Products |
| `platform-config` | C | GraphQL xAPI, Store Admin, Core Settings, Channels & Data Quality |
| `content-cms` | C | CMS & Page Builder, Assets, Image Tools |
| `branding` | C | SEO, White Labeling (frontend + backend) |
| `cross-cutting` | C | Smoke, GA4, Accessibility, Localization, Performance, Browser Compat |

**Layer coverage rules per batch:**
- Each gap is analyzed for applicable layers (REST API, GraphQL, Admin UI, Storefront, E2E)
- Sub-agents use `/qa-test-cases-generator <domain> --layer <layers>` to generate layer-specific cases
- Layer-appropriate tags are enforced: API→`[HTTP]`/`[STATUS]`, GraphQL→`[GQL]`/`[ERRORS]`, Admin→`[BLADE]`/`[GRID]`, E2E→`--- LAYER ---` markers
- Cases route to correct suites by layer: API→Suite 14+, GraphQL→Suite 15, Admin→Suite 16-34, Storefront→Suite 01-13, E2E→Suite 00

Filter batches based on the requested scope:
- `p0`: Only gaps with priorityScore >= 8.0
- `p1`: Only gaps with priorityScore >= 5.0
- `full`: All gaps
- `domain <name>`: Skip batching, delegate to single agent with `--layer all`

### Step 3 — Generate Run ID

Create `COV-YYYY-MM-DD-HHMM` and output directory `reports/coverage/{RUN_ID}/`.

### Step 4 — Dispatch Sub-Agents in Parallel

For each active batch:

1. Create a sub-agent (Agent tool) with:
   - The batch's assigned agent type
   - The filtered gap inventory for that batch's domains
   - Instructions to generate test cases following `coverage-gap-methodology.md` rules
   - Format contract: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` (layer-specific tags)
   - Target suite CSV paths from `config/test-suites.json`
   - Context7 documentation findings for the batch's domains (from Step 1.4)
   - Instruction to query Context7 (`/virtocommerce/vc-docs`) for domain-specific details when generating test cases (e.g., API field validation rules, GraphQL mutation signatures, module-specific config options)
   - Output path: `reports/coverage/{RUN_ID}/batch-{A|B|C}-results.json`

2. Each sub-agent executes:
   - For each gap: determine applicable layers, then generate test cases per layer using enriched CSV format with layer-specific tags
   - Route cases to correct suite CSVs using `domain` and `layer` fields from `config/test-suites.json`. Fallback layer heuristics: API→`concern:api` suites (14, 15), Admin→`concern:admin` suites (16-34, 37-42), Storefront→`concern:functional` frontend suites (01-13, 35-36, 41), E2E→Suite 00
   - If interactive mode: validate P0 cases via browser (sub-agent uses its own browser slot)
   - Write per-batch results JSON: `{domain, layer, casesGenerated, casesValidated, suitesModified}`

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
- **Cross-batch deduplication:** compare case Titles and Steps across all batches. If Batch A and Batch C generated cases for the same scenario (e.g., both touch Suite 15 GraphQL), merge or flag as review items. Prefer the case with richer assertions.
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

## Layer Coverage Matrix
| Layer | Cases Generated | Target Suites | Tags Used |
|-------|----------------|---------------|-----------|
| REST API | N | 14, ... | [HTTP]/[STATUS]/[BODY] |
| GraphQL xAPI | N | 15 | [GQL]/[ERRORS]/[DATA] |
| Admin UI | N | 16-34 | [BLADE]/[GRID]/[SAVE] |
| Storefront UI | N | 01-13 | [NAV]/[ACT]/[DOM] |
| E2E Cross-Layer | N | 00 | --- LAYER --- markers |

## Batch Results
| Batch | Agent | Manifest Domains | Layers | Gaps | Cases | Validated | Duration |
|-------|-------|-----------------|--------|------|-------|-----------|----------|
| A | qa-frontend-expert | purchase-flow, marketing | storefront, graphql, e2e | N | N | N/M | Xm |
| B | qa-backend-expert | auth-security, customer-b2b, communication | api, graphql, admin, e2e | N | N | N/M | Xm |
| C | qa-testing-expert | catalog-search, platform-config, content-cms, branding, cross-cutting | api, graphql, admin | N | N | N/M | Xm |

## Context7 Documentation Findings
| Domain | VC Docs Topic Queried | Gaps Discovered from Docs | New Cases Influenced |
|--------|----------------------|--------------------------|---------------------|
[Per-domain: which VC doc queries were made, what undocumented-in-tests behavior was found, which generated cases were informed by docs]

## Generated Test Cases by Domain × Layer
[Per-domain breakdown: domain → layers → case IDs → target suites]

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

- Follow `.claude/templates/agent-dispatch.md` for dispatch conventions, browser fallback, and error handling
- Never modify suite CSVs directly — always delegate to sub-agents
- Never create new suite files without explicit user approval
- Preserve existing test case IDs — new cases get next sequential ID
- Gap analysis (Step 1) runs centrally, never in sub-agents (avoids redundant reads)
- Each sub-agent gets an isolated browser slot — never share browsers
- CI mode never opens browsers — Cycles 1-2 only
- All generated test cases must use layer-specific tags from `test-case-template.md` (Layer-Specific Formats section)
- Sub-agents must use `/qa-test-cases-generator --layer` to produce correctly tagged cases per layer
- If a batch fails, retry once with a different browser from fallback chain
- Write all outputs to `reports/coverage/{RUN_ID}/`, never to root
- Update `config/test-suites.json` test counts after generation
- For `ci-dry-run`: never commit, never modify CSVs, only produce reports
- Always query Context7 (`/virtocommerce/vc-docs`) during gap analysis to enrich coverage with up-to-date VC module behavior — do not rely solely on local knowledge files
- Sub-agents should query Context7 for domain-specific details when generating test cases (API contracts, field validations, module config options)
- **Deduplication:** Before generating new cases, sub-agents must read the current target suite CSV and check for semantic duplicates — cases with matching Title+Section or Steps that cover the same scenario. Skip generation for already-covered gaps. In Step 5, the orchestrator must also cross-check merged results across batches for cross-batch duplicates before writing final CSVs
