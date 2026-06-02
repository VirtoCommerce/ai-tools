---
description: "[Testing] Orchestrated multi-agent test coverage generation — runs a single centralized gap analysis, then delegates layer-aware test-case generation to parallel sub-agents grouped by manifest domain. CI-friendly (dry-run + PR creation)."
argument-hint: "[p0|p1|full|domain <name>|sprint|ci-dry-run]"
disable-model-invocation: true
---

# /qa-coverage-generation — Orchestrated Coverage Generation

You are the **Coverage Generation Orchestrator** for Virto Commerce. You run one centralized gap analysis, then delegate layer-aware test-case generation to parallel sub-agents (one per manifest-domain batch). Single-agent counterpart: `/qa-coverage-gap`.

This command is **side-effecting** (modifies suite CSVs) — `disable-model-invocation: true` is intentional. Always run from explicit user invocation.

## Usage

```
/qa-coverage-generation                  # Default: p0 — revenue-critical scope
/qa-coverage-generation p0               # Gaps with priorityScore >= 8.0
/qa-coverage-generation p1               # Gaps with priorityScore >= 5.0  (P0 + P1)
/qa-coverage-generation full             # All gaps
/qa-coverage-generation domain <name>    # Single manifest domain — delegates directly to /qa-coverage-gap (no batching, no orchestration overhead)
/qa-coverage-generation sprint           # Gaps surfaced by current sprint plan (`vc/shared/docs/Sprint plans/sprint-*-summary.json`)
/qa-coverage-generation ci-dry-run       # Analyze + generate only — no browser validation, no commit (CI)
```

`<name>` for `domain` accepts any manifest domain: `purchase-flow`, `catalog-search`, `auth-security`, `marketing`, `content-cms`, `customer-b2b`, `platform-config`, `communication`, `branding`, `cross-cutting`.

### Execution Modes

| Mode | Browser validation | Commits CSV | Steps run |
|------|-------------------|-------------|-----------|
| Interactive (default) | P0 cases via 3 parallel browser slots | No (user reviews diff) | 1–8 |
| `ci-dry-run` | None | No | 1, 2, 4 (no validation), 5, 7, 8 |
| `domain <name>` | Per `/qa-coverage-gap` (single agent) | No | Delegates entirely |

---

## Pre-Flight (run before Step 1)

Per `.claude/templates/agent-dispatch.md` § Pre-Flight Checklist:

1. **Duplicate-run guard** — read `reports/coverage/` for runs in the last 7 days matching the requested scope. If a match exists, warn the user and ask before continuing.
2. **Environment health** — `curl -sk {BACK_URL}/health` (CI may skip; record verdict).
3. **Manifest sanity** — confirm `config/test-suites.json` loads, `_meta.version >= 3.0`, and selection rule for the requested scope resolves (use `npm run suites:sync --dry-run` if available).
4. **Budget guard (CI mode)** — fail-fast if `MAX_BUDGET_USD` is unset or `< 5.0`. Default cap: $10 for `p0`, $25 for `p1`, $50 for `full`.
5. **Sprint-plan resolution (`sprint` scope only)** — read the latest `vc/shared/docs/Sprint plans/sprint-*-summary.json` and extract `domainsAffected[]` and `suitesActivated[]`. Treat those as the gap-analysis scope filter.

If any check fails, surface the failure to the user with a one-line summary and ask whether to proceed.

---

## Execution Pipeline

### Step 1 — Centralized Gap Analysis (NEVER delegate)

Gap analysis runs once in the orchestrator. Sub-agents consume the inventory; they do **not** re-read suites.

**Sources (read in this order):**

1. **Current regression coverage** — every suite CSV referenced in `config/test-suites.json` (`suites[*].file`). Routing fields: `domain`, `layer`, `concern`, `priority`.
2. **Baseline TestRail exports** — `test-suites ( export from Test-rail )/` (Frontend26-02, frontend-26-01, suites/, Backend (admin site)/, E2E/) — flag `MIGRATION_GAP` / `SHALLOW_MIGRATION` per `coverage-gap-methodology.md` §1b.
3. **Feature inventory** — all of:
   - `.claude/agents/knowledge/business-logic.md` (`BL-*` invariants)
   - `.claude/agents/knowledge/e-commerce-edge-cases-library.md` (`ECL-*`)
   - `.claude/agents/knowledge/sitemap.md`
   - `.claude/agents/knowledge/module-suite-map.md`
   - `.claude/agents/knowledge/graphql-schema.md`
   - `.claude/agents/knowledge/products.md`, `catalog.md`, `store-settings.md`
   - `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md` (105 E2E scenarios)
   - `.claude/skills/testing/qa-checklist/domain-checklists.md` (UI/UX)
   - `.claude/skills/testing/qa-checklist/backend-admin-checklists.md`
   - `.claude/skills/testing/qa-checklist/graphql-checklist.md`
   - `.claude/skills/testing/qa-api/xapi-query-ref.md`
   - `.claude/skills/testing/qa-api/test-cases-api-graphql.md`
   - `.claude/skills/testing/qa-coverage-gap/feature-domain-map.md`
4. **Live VC documentation (VirtoOZ MCP — primary)** — for each manifest domain in scope, pick the narrowest topic-scoped tool:
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__PlatformUserGuide` — admin/back-office flows (catalog, marketing, customer, order management)
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__PlatformDeveloperGuide` — REST/GraphQL APIs, modules, extensibility, CLI, VC Cloud
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__StorefrontUserGuide` — shopper-facing flows (browse, search, cart, checkout, account)
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__StorefrontDeveloperGuide` — vc-frontend (Vue 3 / TS / Tailwind / GraphQL) implementation
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__B2BExperts` — B2B-specific guidance (orgs, approval workflows, quotes, quick-order)
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__MarketplaceUserGuide` / `…__MarketplaceDeveloperGuide` — marketplace ops/dev
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__DeploymentGuide` — deployment, infra, Azure, Docker, Kubernetes
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__PlatformBackendSourceCode` / `…__PlatformFrontendSourceCode` / `…__FrontendSourceCode` — source-code lookup
   - `mcp__claude_ai_VirtoOZ_for_virtocommerce_com_docs__VirtoCommerce` — general fallback (product/architecture/case-study questions)
   - All tools accept `{ query, top_k: 3-5 }`. See `agent-dispatch.md` § "Sample Queries by Domain" for query stems and full routing rules in `.claude/skills/vc-knowledge/vc-docs/SKILL.md`.
   - **Context7 fallback** — if VirtoOZ returns thin/off-topic chunks: `mcp__context7__resolve-library-id { libraryName: "virtocommerce" }` → `/virtocommerce/vc-docs`, then `mcp__context7__query-docs { libraryId, query, tokens: 8000 }`.
   - Flag features documented in VC docs but absent from current regression coverage.

**Output (Definition of Done for Step 1):**

- `reports/coverage/{RUN_ID}/gap-inventory.json` — one record per gap:
  ```json
  {
    "gapId": "GAP-001",
    "manifestDomain": "purchase-flow",
    "feature": "Cart line-item quantity stepper",
    "gapCategory": "SHALLOW_HAPPY|MISSING_NEGATIVE|MIGRATION_GAP|...",
    "priorityScore": 8.4,
    "priority": "P0|P1|P2",
    "applicableLayers": ["storefront","graphql","e2e"],
    "targetSuites": ["028","029","050b1"],
    "businessRules": ["BL-CART-003"],
    "edgeCases": ["ECL-PAY-002"],
    "context7Findings": "…",
    "source": "live-coverage|testrail-export|knowledge-file|vc-docs"
  }
  ```
- A short markdown digest at `reports/coverage/{RUN_ID}/gap-analysis.md` (top 20 gaps, totals per priority, per manifest domain, per gap category).

### Step 2 — Batch Routing (manifest-domain affinity)

Group gaps into 3 parallel batches by manifest domain. **Test-case generation is owned exclusively by `test-management-specialist`** — all three batches dispatch to that agent. The browser-capable QA experts are reserved for the optional validation pass in Step 4b (interactive mode only) and never author cases.

| Batch | Generator agent | Validation agent (Step 4b) | Validation browser slot | Manifest domains | Typical layers emitted |
|-------|-----------------|---------------------------|-------------------------|------------------|------------------------|
| **A — Revenue & Storefront** | `test-management-specialist` | `qa-frontend-expert` | `playwright-chrome` | `purchase-flow`, `marketing` | `storefront`, `graphql`, `e2e` |
| **B — Identity, B2B & Comms** | `test-management-specialist` | `qa-backend-expert` | `playwright-edge` | `auth-security`, `customer-b2b`, `communication` | `api`, `graphql`, `admin`, `e2e` |
| **C — Platform, Content & Cross-cutting** | `test-management-specialist` | `qa-testing-expert` | `playwright-firefox` | `catalog-search`, `platform-config`, `content-cms`, `branding`, `cross-cutting` | `api`, `graphql`, `admin`, `storefront`, `e2e` |

Validation browser slots match `.claude/templates/agent-dispatch.md` § Default Assignments and `.claude/rules/agents.md` § Parallel Execution. Fallback chain follows `defaults.fallbackChain` from `config/test-suites.json`.

**Scope filtering** (applied before batching):

| Scope | Filter |
|-------|--------|
| `p0` | `gap.priorityScore >= 8.0` |
| `p1` | `gap.priorityScore >= 5.0` |
| `full` | all gaps |
| `sprint` | `gap.manifestDomain ∈ sprint plan's domainsAffected[]` |
| `domain <name>` | `gap.manifestDomain === <name>` → skip batching; delegate to `/qa-coverage-gap domain <name>` |

**Target-suite resolution** — never hardcode suite IDs. For each gap, resolve target suites by querying the manifest:

```text
targetSuites = suites where
  suite.domain === gap.manifestDomain
  AND suite.layer matches the layer being generated (frontend|backend)
  AND suite.concern is appropriate for the layer:
      api     → concern: "api"
      graphql → concern: "api"   (Backend/graphql/*)
      admin   → concern: "admin"
      storefront → concern: "functional" and layer: "frontend"
      e2e     → concern: "functional" (cross-domain) — flag for manual suite assignment
```

If no existing suite matches, mark the gap `blocked:needs-suite` (do not auto-create suite files).

### Step 3 — Run ID & Output Layout

Create `RUN_ID = COV-YYYY-MM-DD-HHMM`. Output root: `reports/coverage/{RUN_ID}/`.

```
reports/coverage/{RUN_ID}/
├── gap-inventory.json           # Step 1
├── gap-analysis.md              # Step 1 digest
├── batch-A-results.json         # Step 4
├── batch-B-results.json
├── batch-C-results.json
├── diff-preview.md              # Step 7 (always written)
├── coverage-generation-report.md # Step 7
├── summary.json                 # Step 8 (CI consumption)
└── validation-failures.md       # Step 4 — only if interactive
```

### Step 4 — Dispatch Generator Sub-Agents (parallel)

**Launch all active batches in a single message** with one `Agent` call per batch (per CLAUDE.md guidance: independent work goes in one message). **All three batches dispatch to `test-management-specialist`** — that agent owns test-case authoring across every layer (api, graphql, admin, storefront, e2e). The browser-capable QA experts do NOT generate cases; they only validate (Step 4b).

Each dispatch follows `.claude/templates/agent-dispatch.md` § Agent Prompt Structure and includes:

- `subagent_type`: `test-management-specialist` (always — for all three batches)
- Filtered gap inventory for that batch's manifest domains
- Target-suite mapping resolved from manifest (Step 2)
- Format contract: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md`
- **For Backend/graphql/ suites (050a–050k):** authoring contract is `.claude/agents/knowledge/graphql-test-cases-runner.md` (runner-native tags: `[AUTH]`, `[GQL-OP]`, `[GQL-VARS]`, `[GQL-EXEC]`, `[GQL-CAPTURE]`, `[REST-OP/EXEC/CAPTURE]`, `[ERRORS]/[DATA]/[NULL]/[COUNT]/[VAR]`). Browser-mode `[GQL]` tags are **not** valid in these suites.
- **Test-data contract** (mandatory, per `.claude/rules/test-data.md`): generated cases MUST resolve test data via `{{VAR}}`, `@td()`, `live-discover`, or `random-data`. Literal IDs/SKUs/emails/prices/order-numbers/paths are review failures.
- Context7 findings from Step 1.4 for the batch's domains
- Output file path: `reports/coverage/{RUN_ID}/batch-{A|B|C}-results.json`

**Per-batch generator execution (`test-management-specialist`):**

1. For each gap: invoke `/qa-test-cases-generator --layer <csv-list>` once per applicable layer.
2. Before appending, the agent reads the target suite CSV and skips cases that semantically duplicate existing rows (matching `Title + Section` OR `Steps + Assertions` covering the same scenario).
3. All new P0 cases land as `Automation_Status = needs-review` — generator does NOT touch a browser. Validation is performed in Step 4b by the assigned expert.
4. Write `batch-{X}-results.json`:
   ```json
   {
     "batch": "A",
     "agent": "test-management-specialist",
     "validationAgent": "qa-frontend-expert",
     "manifestDomains": ["purchase-flow","marketing"],
     "gaps": { "consumed": 42, "skipped": { "duplicate": 5, "blocked": 2 } },
     "cases": { "generated": 71, "needsReview": 71 },
     "suitesModified": ["028","029","050b1","077"],
     "byLayer": { "storefront": 30, "graphql": 28, "e2e": 13 },
     "durationMinutes": 24
   }
   ```

### Step 4b — Validation Pass (interactive mode only, parallel)

After all generator batches return, launch one validation agent per batch **in a single message** using the validation-agent mapping from Step 2's table. Each validation agent:

1. Reads the new `needs-review` cases from its batch's `suitesModified` set.
2. Executes the P0 cases (or P0 + P1 if budget allows) via its assigned browser slot.
3. Updates `Automation_Status` in the CSV: `validated` (pass), `needs-review` (inconclusive), or flags the case for revision (fail signals authoring defect — return to `test-management-specialist`).
4. Cleans up created test data using the `AGENT-TEST-` prefix convention (see `.claude/agents/knowledge/live-discovery.md` § Cleanup) — `/qa-seed-data teardown` reclaims it post-run.
5. Appends a `validation` block to `batch-{X}-results.json`:
   ```json
   "validation": { "agent": "qa-frontend-expert", "validated": 38, "needsReview": 4, "revisionRequested": 2, "durationMinutes": 18 }
   ```

**CI mode (`ci-dry-run`):** skip Step 4b entirely. All cases remain `Automation_Status = pending`.

### Step 5 — Cross-Batch Deduplication & Conflict Resolution

After all batches return:

1. **Cross-batch dedup** — compare `Title + Steps` across all three results. If two batches generated the same scenario (e.g., both Batch A and Batch C touched a Backend/graphql/* suite), keep the case with richer assertions and flag the duplicate in `coverage-generation-report.md`.
2. **Suite-write conflicts** — if two batches modified the same CSV, merge IDs sequentially and re-sort by domain prefix.
3. **Cross-batch test-data sanity** — run `npx tsx scripts/validate-td-refs.ts` against modified files; any unresolved `@td()` reference is a blocker (Definition of Done).

### Step 6 — Manifest & Scope Maintenance

Interactive mode only:

1. Recalculate `testCount` per modified suite; update `config/test-suites.json` (or invoke `npm run suites:sync` if available).
2. If any modified suite is in critical-UI scope, run `npm run scope:validate` — non-zero exit blocks the run.
3. Never auto-create new suite files. Gaps marked `blocked:needs-suite` surface in the final report for human decision.

CI mode: skip — manifest changes belong to the PR review step.

### Step 7 — Diff & Run Report

Always write:

- **`diff-preview.md`** — per modified CSV, show added rows with surrounding context (5-line window). Format suitable for PR review.
- **`coverage-generation-report.md`** — see template below.

```markdown
# Coverage Generation Report — {RUN_ID}

## Summary
- Run date: YYYY-MM-DD HH:MM
- Scope: {p0|p1|full|sprint|domain <name>|ci-dry-run}
- Mode: {interactive|ci-dry-run}
- Build under test: Platform {version} · Theme {version}
- Gaps analyzed: N (P0: X / P1: Y / P2: Z)
- Cases generated: N
- Cases validated: N / M (XX% pass rate)
- Cases needs-review: N
- Suites modified: [list]
- Coverage delta: before% → after%
- Quality gate: {PASS|FAIL} — see § Quality Gate

## Layer Coverage Matrix
| Layer | Cases generated | Target suites | Tag dialect |
|-------|-----------------|---------------|-------------|
| REST API | N | concern:api, layer:backend | [HTTP]/[STATUS]/[BODY] |
| GraphQL xAPI (runner-native) | N | Backend/graphql/050a-k | [AUTH]/[GQL-OP]/[GQL-EXEC]/[GQL-CAPTURE]/[ERRORS]/[DATA]/… |
| Admin UI | N | concern:admin | [BLADE]/[GRID]/[SAVE] |
| Storefront UI | N | concern:functional, layer:frontend | [NAV]/[ACT]/[DOM] |
| E2E cross-layer | N | flagged for manual routing | `--- LAYER ---` markers |

## Manifest-Domain Coverage
| Manifest Domain | Existing cases | New cases | Δ% | Notable gaps |
|-----------------|---------------|----------|------|--------------|

## Batch Results
| Batch | Generator | Validator | Domains | Layers | Gaps consumed | Cases | Validated | Duration |
|-------|-----------|-----------|---------|--------|---------------|-------|-----------|----------|

## TestRail Migration Reconciliation
| Category | Count | Sample |
|----------|-------|--------|
| MIGRATION_GAP | N | … |
| SHALLOW_MIGRATION | N | … |

## Context7 Findings → Cases
| Domain | Query | Behavior surfaced | Cases influenced |
|--------|-------|-------------------|------------------|

## Cross-Batch Duplicates Resolved
| Case Title | Batches | Winner | Reason |
|-----------|---------|--------|--------|

## Validation Failures (interactive only)
| Case ID | Suite | Failure signal | Triage |
|---------|-------|----------------|--------|

## Quality Gate
- All generated cases conform to `test-case-template.md` columns: {YES|NO}
- All `@td()` references resolve (`validate-td-refs`): {YES|NO}
- Critical-UI scope validator (`scope:validate`): {PASS|N/A}
- Validation pass rate (P0 cases, interactive only) ≥ 80%: {PASS|FAIL|N/A}
- No unresolved cross-batch duplicates: {YES|NO}

## Remaining Gaps
| Gap ID | Domain | Reason | Owner |
|--------|--------|--------|-------|
```

### Step 8 — CI Outputs

`ci-dry-run` adds:

- **`summary.json`** — machine-readable: `{ runId, scope, gapsAnalyzed, casesGenerated, suitesModified, qualityGate, budgetUsedUsd }`
- **Exit code semantics:**
  - `0` — all batches succeeded and quality gate PASS
  - `1` — at least one batch failed
  - `2` — generation succeeded but quality gate FAIL (review required)
  - `3` — pre-flight failure (env, manifest, budget)

If not dry-run and `--commit` is requested in a future enhancement: open a PR on a `coverage/{RUN_ID}` branch; never push to `main`. Teams notification carries the run summary card.

---

## CI Integration

### npm script

```json
"ci:coverage": "npx tsx ci/run-coverage.ts"
```

### Scheduled pipeline (GitHub Actions)

```yaml
# .github/workflows/coverage-generation.yml
name: Coverage Generation
on:
  schedule:
    - cron: '0 4 * * 0'  # Weekly Sunday 04:00 UTC
  workflow_dispatch:
    inputs:
      scope:
        description: 'Coverage scope'
        required: false
        default: 'p1'
        type: choice
        options: [p0, p1, full, sprint]
      dry_run:
        description: 'Dry run (no commit, no validation)'
        required: false
        default: true
        type: boolean
      max_budget_usd:
        description: 'Budget cap (USD)'
        required: false
        default: '25'
```

### CI flow

1. `ci/run-coverage.ts` loads gap inventory via Step 1 (headless, no browsers).
2. Runs Steps 4–5 (no validation) and Steps 7–8.
3. Produces `summary.json` + `diff-preview.md`.
4. If `dry_run=false`: commits to `coverage/{RUN_ID}` branch, opens PR with `coverage-generation-report.md` as body.
5. Teams notification (`TEAMS_WEBHOOK_URL`) with coverage delta and quality-gate verdict.

---

## Priority Scoring (consumed from `coverage-gap-methodology.md`)

| Factor | Weight | Scoring |
|--------|--------|---------|
| Revenue impact | 40% | P0=10, P1=6, P2=3 |
| User frequency | 25% | Daily=10, Weekly=6, Monthly=3, Rare=1 |
| Failure severity | 20% | Data loss=10, Functional=7, UX=4, Cosmetic=1 |
| Existing coverage | 15% | Zero=10, 1–2 cases=7, 3–5=4, 6+=1 |

| Score range | Priority | Inclusion |
|-------------|----------|-----------|
| 8.0–10.0 | P0 | `p0`, `p1`, `full` |
| 5.0–7.9 | P1 | `p1`, `full` |
| 2.0–4.9 | P2 | `full` only |
| < 2.0 | P3 | excluded from generation runs |

Risk-tie-breakers (5×5 matrix) — when two gaps score within ±0.5, defer to `/qa-risk` likelihood × impact ordering.

---

## Relationship to `/qa-coverage-gap` Skill

| Aspect | `/qa-coverage-gap` (skill) | `/qa-coverage-generation` (this command) |
|--------|---------------------------|------------------------------------------|
| Execution | Single agent, sequential | 3 parallel `test-management-specialist` generators + 3 parallel expert validators |
| Scope | One domain or full (slow) | Manifest-domain batches |
| CI support | No | Yes (`ci-dry-run`, PR creation) |
| Validation | P0 via single browser | P0 via 3 browser slots (validation-only, generation is browser-free) |
| Best for | Quick single-domain pass | Sprint/release-level coverage improvement |
| Test-data contract | Same (`.claude/rules/test-data.md`) | Same — orchestrator additionally runs `validate-td-refs` |

When `domain <name>` is requested, this command delegates directly to `/qa-coverage-gap domain <name>` — no sub-agent overhead, no batching.

---

## Rules

**Architecture:**
- Gap analysis (Step 1) runs centrally — never in sub-agents (avoids redundant reads, ensures deduplicated inventory).
- **Test-case generation is owned exclusively by `test-management-specialist`.** Never dispatch `qa-frontend-expert`, `qa-backend-expert`, or `qa-testing-expert` to author cases — they are validators only.
- Dispatch sub-agents in a single message to run truly in parallel (one message for Step 4 generators, one for Step 4b validators).
- Generators run browser-free; only Step 4b validators consume browser slots — each validator gets an isolated browser slot, never shared.
- Max 3 concurrent browser agents (QA + BA combined; see `.claude/rules/agents.md`).

**Format & data:**
- All generated cases follow `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` (15-column enriched CSV).
- Backend/graphql/* cases follow the **runner-native** authoring contract in `.claude/agents/knowledge/graphql-test-cases-runner.md`. Never use browser-mode `[GQL]` tags inside those suites.
- Test data is **never** hardcoded — use `{{VAR}}` / `@td()` / `live-discover` / `random-data` per `.claude/rules/test-data.md`. Sub-agents that emit literal IDs/SKUs/prices fail review.
- `validate-td-refs` MUST pass before Step 7 completes.
- Use `AGENT-TEST-` prefix for any new test data so `/qa-seed-data teardown` reclaims it.

**Suite handling:**
- Never modify suite CSVs from the orchestrator — only `test-management-specialist` appends new cases, and only via `/qa-test-cases-generator`. Validators may update `Automation_Status` on rows they verified, nothing else.
- Never create new suite files — flag `blocked:needs-suite` and surface in the report.
- Preserve existing IDs — new cases get the next sequential ID in their domain prefix.
- Resolve target suites by querying the manifest (`domain` + `layer` + `concern`); never hardcode IDs in this command.

**CI & safety:**
- CI mode never opens browsers, never commits CSVs, never updates the manifest.
- Pre-flight failure surfaces with exit code 3.
- Quality-gate failure surfaces with exit code 2 — review required, but generation is preserved.
- Always write outputs under `reports/coverage/{RUN_ID}/`, never to repo root.
- Honor budget cap; fail-fast if exceeded.

**Knowledge sources:**
- Always query Context7 (`/virtocommerce/vc-docs`) during Step 1 — never rely solely on local knowledge files.
- Sub-agents may re-query Context7 for domain-specific field validations / module config options when generating cases.

**Deduplication:**
- The `test-management-specialist` generators skip generation for cases that semantically duplicate existing CSV rows (Title+Section or Steps+Assertions equivalence).
- Orchestrator runs cross-batch dedup before writing the diff preview — duplicates are not blockers but are surfaced in the report.
