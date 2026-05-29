---
description: "[Testing] Autonomous test coverage gap analysis and generation — identifies missing test cases, generates enriched CSV test cases, validates P0 cases via browser, and reports improvements. Single-agent counterpart to /qa-coverage-generation."
argument-hint: "analyze | generate | validate | full | domain <name> | suite <ID>"
disable-model-invocation: true
---

# /qa-coverage-gap — Test Coverage Gap Analysis & Generation

Autonomously improves test coverage by identifying gaps between application features and existing test suites, generating new test cases in the enriched agent-native format, validating P0 cases, and reporting improvements. Operates in a 4-cycle iterative pipeline.

For sprint- or release-level multi-domain runs with parallel sub-agents, use the orchestrated counterpart `/qa-coverage-generation`.

## Usage

```
/qa-coverage-gap                    # Run full 4-cycle pipeline (analyze → generate → validate → report)
/qa-coverage-gap analyze            # Cycle 1 only: gap analysis with prioritized report
/qa-coverage-gap generate           # Cycles 1-2: analyze + generate test cases
/qa-coverage-gap validate           # Cycles 1-3: analyze + generate + validate P0 cases
/qa-coverage-gap full               # All 4 cycles including commit
/qa-coverage-gap domain <name>      # Focus on a manifest domain (purchase-flow, catalog-search, …)
/qa-coverage-gap suite <ID>         # Focus on a specific suite by ID (e.g., 028, 050b1, 072c)
```

`<name>` for `domain` accepts any manifest domain from `config/test-suites.json` `_meta.domains`: `purchase-flow`, `catalog-search`, `auth-security`, `marketing`, `content-cms`, `customer-b2b`, `platform-config`, `communication`, `branding`, `cross-cutting`.

## Supporting Files

- **coverage-gap-methodology.md** — Gap detection heuristics, TestRail cross-reference rules, priority scoring matrix, gap categories
- **feature-domain-map.md** — Manifest-domain inventory with expected coverage thresholds

## Architecture

### Cycle 1 — Analysis (always runs)

1. **Read regression coverage** — every suite CSV referenced in `config/test-suites.json` (`suites[*].file`). Use the manifest's `domain` / `layer` / `concern` / `priority` fields for routing — never hardcode suite IDs.
2. **Cross-reference TestRail baselines** in `test-suites ( export from Test-rail )/` — surface `MIGRATION_GAP` and `SHALLOW_MIGRATION` per `coverage-gap-methodology.md` §1b.
3. **Read feature inventory** from:
   - `.claude/agents/knowledge/business-logic.md` — `BL-*` invariants
   - `.claude/agents/knowledge/e-commerce-edge-cases-library.md` — `ECL-*` edge cases
   - `.claude/agents/knowledge/sitemap.md` — storefront page inventory
   - `.claude/agents/knowledge/module-suite-map.md` — module-to-suite mapping
   - `.claude/agents/knowledge/graphql-schema.md` — xAPI schema reference (REQUIRED before authoring any GraphQL case)
   - `.claude/agents/knowledge/products.md`, `catalog.md`, `store-settings.md` — realistic test-data context
   - `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md` — 105 E2E scenarios
   - `.claude/skills/testing/qa-checklist/domain-checklists.md` — UI/UX storefront checklists
   - `.claude/skills/testing/qa-checklist/backend-admin-checklists.md` — Admin SPA & module checklists
   - `.claude/skills/testing/qa-checklist/graphql-checklist.md` — GraphQL-specific checklist
   - `.claude/skills/testing/qa-api/xapi-query-ref.md` — endpoint inventory
   - `.claude/skills/testing/qa-api/test-cases-api-graphql.md` — API/GraphQL test-case patterns
4. **Live VC documentation (Context7)** — for the in-scope domain(s):
   - `mcp__context7__resolve-library-id { libraryName: "virtocommerce" }` → `/virtocommerce/vc-docs`
   - `mcp__context7__query-docs { libraryId, query, tokens: 8000 }` — query stems per `.claude/templates/agent-dispatch.md` § Sample Queries by Domain
   - Flag features documented in VC docs but missing from current coverage.
5. **Map every test case** to its manifest domain via the manifest's `domain` field; supplement with `Section` column and title keywords only when the manifest is ambiguous.
6. **Identify gaps** per `coverage-gap-methodology.md` categories (`ZERO_COVERAGE`, `SHALLOW_HAPPY`, `MISSING_NEGATIVE`, `MISSING_INTEGRATION`, `MISSING_CROSS_DOMAIN`, `STALE_COVERAGE`, `MIGRATION_GAP`, `SHALLOW_MIGRATION`).
7. **Score gaps** using the 4-factor matrix in `coverage-gap-methodology.md` §3:
   - Revenue impact (40%) · User frequency (25%) · Failure severity (20%) · Existing coverage (15%)
   - 8.0–10.0 → P0 · 5.0–7.9 → P1 · 2.0–4.9 → P2 · <2.0 → P3 (excluded from generation)
8. **Output:**
   - `reports/coverage/{RUN_ID}/gap-inventory.json` (one typed record per gap; see schema in `/qa-coverage-generation` Step 1)
   - `reports/coverage/{RUN_ID}/gap-analysis.md` (digest)

Definition of Done: every gap has `manifestDomain`, `applicableLayers[]`, `targetSuites[]` resolved against the manifest, `priorityScore`, `priority`, and `gapCategory`.

### Cycle 2 — Generation (runs with `generate`, `validate`, `full`)

1. For each gap, invoke `/qa-test-cases-generator --layer <csv-list>` once per applicable layer. Layers: `api`, `graphql`, `admin`, `storefront`, `e2e`.
2. Format contract: `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` (15-column enriched CSV: ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status).
3. **For Backend/graphql/* suites (`050a`–`050k`):** authoring contract is `.claude/agents/knowledge/graphql-test-cases-runner.md` — runner-native tags (`[AUTH]/[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]/[REST-OP/EXEC/CAPTURE]/[ERRORS]/[DATA]/[NULL]/[COUNT]/[VAR]`). Browser-mode `[GQL]` tags are **not** valid in these suites.
4. **Test-data contract (mandatory)** per `.claude/rules/test-data.md` — resolve via `{{VAR}}`, `@td()`, `live-discover`, or `random-data`. Literal IDs/SKUs/emails/prices/order-numbers/paths are review failures. Use `AGENT-TEST-` prefix for generated entities so `/qa-seed-data teardown` reclaims them.
5. **Deduplication** — before appending, read target suite CSV and skip semantic duplicates (matching `Title + Section` OR `Steps + Assertions`).
6. **Test-case quality rules:**
   - Unique ID with domain prefix (next sequential within the suite)
   - Deterministic numbered steps with typed tags
   - Explicit assertions (predicate-driven, no "verify it looks correct")
   - Happy path → critical error paths → edge cases (boundary, negative, cross-domain)
   - Priority mapping: P0 = Critical, P1 = High, P2 = Medium
7. **Append** cases to the target suite CSVs resolved in Cycle 1.
8. If no existing suite matches, mark `blocked:needs-suite` and surface in the report — never auto-create suite files.

Definition of Done: every generated case conforms to the template, references at least one `BL-*` invariant (or `ECL-*`), and `npx tsx scripts/validate-td-refs.ts` passes against all modified CSVs.

### Cycle 3 — Validation (runs with `validate`, `full`)

1. Execute each new **P0 case** against QA via the assigned browser (default: `playwright-chrome`; fallback per `defaults.fallbackChain` in `config/test-suites.json`).
2. If steps don't work (element not found, flow changed), revise the case once; if still broken, mark `Automation_Status = needs-review` with a Failure_Signal note.
3. Mark `Automation_Status = validated | needs-review | pending` per outcome.
4. Cleanup created test data using the `AGENT-TEST-` prefix (see `.claude/agents/knowledge/live-discovery.md` § Cleanup).

Definition of Done: ≥80% of new P0 cases reach `validated`; remainder are flagged `needs-review` with explicit failure signals (not silently skipped).

### Cycle 4 — Report & Commit (runs with `full` only)

1. **Quality gate** — must all pass before commit:
   - Generated cases conform to `test-case-template.md`
   - `validate-td-refs` passes
   - If any modified suite is in critical-UI scope: `npm run scope:validate` exits 0
   - P0 validation pass rate ≥ 80%
2. Update `reports/coverage/{RUN_ID}/coverage-generation-report.md` with before/after comparison, batch results, TestRail migration reconciliation, Context7 findings → cases, remaining gaps.
3. Update `config/test-suites.json` `testCount` per modified suite (or invoke `npm run suites:sync` if available).
4. Git commit message format: `test(coverage): add N new test cases covering [areas] - automated gap analysis (RUN_ID)`. Do not push.

If quality gate fails, abort Cycle 4 — leave CSVs as written (user reviews diff before manual commit).

## Manifest-Domain Routing

This skill routes by the manifest domain (`config/test-suites.json` `suites[*].domain`), not by 2-digit suite IDs.

| Manifest Domain | Typical Layers | Lead Sub-agent |
|----------------|----------------|----------------|
| `purchase-flow` | storefront, graphql, e2e | `qa-frontend-expert` |
| `marketing` | storefront, admin, e2e | `qa-frontend-expert` |
| `auth-security` | api, admin, e2e | `qa-backend-expert` |
| `customer-b2b` | api, graphql, admin, e2e | `qa-backend-expert` |
| `communication` | api, admin, e2e | `qa-backend-expert` |
| `catalog-search` | api, graphql, admin, storefront | `qa-testing-expert` |
| `platform-config` | api, graphql, admin | `qa-testing-expert` |
| `content-cms` | admin, storefront | `qa-testing-expert` |
| `branding` | admin, storefront | `qa-testing-expert` |
| `cross-cutting` | storefront, e2e | `qa-testing-expert` |

**Target-suite resolution rule** (run for every gap):

```text
targetSuites = suites where
  suite.domain === gap.manifestDomain
  AND suite.layer matches the layer being generated (frontend|backend)
  AND suite.concern is appropriate for the layer:
      api / graphql → concern: "api"
      admin         → concern: "admin"
      storefront    → concern: "functional" and layer: "frontend"
      e2e           → concern: "functional" (cross-domain)
```

Never hardcode suite IDs in this skill — query the manifest. The manifest currently has 97 suites (v3.0) including sub-suites such as `048b`, `050a`–`050k`, `072b`–`072d`.

## Integration with Other Skills & Commands

| Direction | Skill / Command | Relationship |
|-----------|-----------------|--------------|
| Upstream | `/qa-plan` | E2E scenario catalog provides expected coverage |
| Upstream | `/qa-checklist` | Domain checklists define expected test areas |
| Upstream | `/qa-api ref` | API/GraphQL reference inventory |
| Upstream | `/qa-risk` | 5×5 matrix as tie-breaker for priority scores within ±0.5 |
| Upstream | `agents/knowledge/sitemap.md` | Page inventory |
| Upstream | `agents/knowledge/graphql-schema.md` | Schema verification before authoring GraphQL cases |
| Sibling | `/qa-coverage-generation` | Orchestrated multi-agent counterpart (uses this skill via `domain` mode) |
| Downstream | `/qa-test-cases-generator` | Receives `--layer` invocations to author cases |
| Downstream | `/qa-review-tests` | Reviews generated cases on 8 dimensions before merge |
| Downstream | `/qa-test` | Generated cases can be executed by qa-testing-expert |
| Downstream | `/qa-regression` | Updated suites feed into regression runs |
| Downstream | `/qa-metrics` | Coverage metrics updated post-generation |

## Rules

**Architecture:**
- Single-agent execution by design — for parallel sprint/release-level runs, defer to `/qa-coverage-generation`.
- Resolve target suites by querying `config/test-suites.json` — never hardcode suite IDs in this skill.

**Format & data:**
- All generated cases follow `.claude/skills/qa-methodology/qa-test-cases-generator/test-case-template.md` (15-column enriched CSV).
- Backend/graphql/* (`050a`–`050k`) cases follow the runner-native authoring contract in `.claude/agents/knowledge/graphql-test-cases-runner.md`. Never use browser-mode `[GQL]` tags inside those suites.
- Test data is never hardcoded — `{{VAR}}` / `@td()` / `live-discover` / `random-data` per `.claude/rules/test-data.md`.
- `npx tsx scripts/validate-td-refs.ts` MUST pass before Cycle 3 begins (interactive) or before Cycle 4 commits (`full`).
- Use the `AGENT-TEST-` prefix for any new test data so `/qa-seed-data teardown` reclaims it.
- Generated steps must be MCP-executable (no manual-only steps).
- Never hardcode environment URLs — use `{FRONT_URL}` / `{BACK_URL}` patterns.

**Suite handling:**
- Never create new suite files — flag `blocked:needs-suite` and surface in the report.
- Preserve existing IDs — new cases get the next sequential ID in their domain prefix.
- Mark gaps requiring new test-data creation as `blocked:test-data`.

**Validation & gates:**
- P0 validation requires actual browser execution, not just review.
- Quality gate (Cycle 4): format conformance + `validate-td-refs` + `scope:validate` (when applicable) + ≥80% P0 pass rate — all must pass before commit.

**Knowledge sources:**
- Gap analysis must reference `business-logic.md` invariants (`BL-*`) for priority scoring and case authoring.
- Always query Context7 (`/virtocommerce/vc-docs`) during Cycle 1 — never rely solely on local knowledge files.
- For GraphQL cases, consult `graphql-schema.md` (live introspection) before authoring queries/mutations.

**Output:**
- All artifacts under `reports/coverage/{RUN_ID}/` — never repo root.
