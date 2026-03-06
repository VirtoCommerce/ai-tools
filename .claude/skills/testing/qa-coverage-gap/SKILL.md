---
description: "[Testing] Autonomous test coverage gap analysis and generation — identifies missing test cases, generates CSV test cases, validates P0 cases, and reports improvements"
argument-hint: "analyze | generate | validate | full | domain <name> | suite <ID>"
---

# /qa-coverage-gap — Test Coverage Gap Analysis & Generation

Autonomously improves test coverage by identifying gaps between application features and existing test suites, generating new test cases, validating them, and reporting improvements. Operates in a 4-cycle iterative pipeline.

## Usage

```
/qa-coverage-gap                    # Run full 4-cycle pipeline (analyze → generate → validate → report)
/qa-coverage-gap analyze            # Cycle 1 only: gap analysis with prioritized report
/qa-coverage-gap generate           # Cycles 1-2: analyze + generate test cases
/qa-coverage-gap validate           # Cycles 1-3: analyze + generate + validate P0 cases
/qa-coverage-gap full               # All 4 cycles including commit
/qa-coverage-gap domain checkout    # Focus on a specific domain (checkout, catalog, b2b, admin, etc.)
/qa-coverage-gap suite 04           # Focus on a specific suite by ID
```

## Supporting Files

- **coverage-gap-methodology.md** — Gap detection heuristics, feature-to-suite mapping rules, priority scoring
- **feature-domain-map.md** — Complete feature domain inventory with expected test coverage thresholds

## Architecture

### Cycle 1 — Analysis (always runs)

1. **Read all suite CSVs** from `regression/suites/Frontend/` and `regression/suites/Backend/`
2. **Read feature inventory** from:
   - `.claude/agents/knowledge/business-logic.md` — business invariants
   - `.claude/skills/testing/qa-plan/e2e-scenario-catalog.md` — 105 E2E scenarios
   - `.claude/skills/vc-knowledge/vc-frontend/sitemap.md` — storefront pages
   - `.claude/skills/vc-knowledge/vc-api/xapi-query-ref.md` — API endpoints
   - `.claude/skills/testing/qa-checklist/domain-checklists.md` — 18 domain checklists
3. **Map every test case** to its feature domain using Section column and title keywords
4. **Identify gaps**: features/flows that exist in the app but have zero or insufficient test cases
5. **Score gaps** by business impact:
   - **P0-revenue**: Payment, checkout, cart integrity, order creation
   - **P1-data**: B2B isolation, customer data, inventory accuracy
   - **P2-experience**: UX, localization, performance, analytics
6. **Output**: `reports/coverage/gap-analysis-YYYY-MM-DD.md`

### Cycle 2 — Generation (runs with `generate`, `validate`, `full`)

1. For each identified gap, generate test cases in CSV format matching suite column structure:
   `ID, Title, Section, Type, Priority, Estimate, Preconditions, Steps, Expected Result, References, Automation Status`
2. **Test case quality rules**:
   - Each case: unique ID with domain prefix, deterministic numbered steps, explicit expected results
   - Priority mapping: P0 = Critical, P1 = High, P2 = Medium
   - Happy path first → critical error paths → edge cases
3. **Append** generated cases to appropriate existing suite CSVs
4. If a feature area has no matching suite, flag for manual suite creation decision

### Cycle 3 — Validation (runs with `validate`, `full`)

1. Execute each newly generated **P0 test case** against QA environment using Playwright MCP
2. If steps don't work (element not found, flow changed), **revise** the test case
3. Mark in CSV: `Automation Status` = `validated` or `needs-review`
4. Browser assignment: use `playwright-chrome` for validation

### Cycle 4 — Report & Commit (runs with `full`)

1. Update `reports/coverage/gap-analysis-YYYY-MM-DD.md` with before/after comparison
2. Update `config/test-suites.json` with new test counts per suite
3. Produce summary: gaps found, cases generated, cases validated, remaining gaps
4. Git commit with message: `test(coverage): add N new test cases covering [areas] - automated gap analysis`

## Domain Classification

| Domain ID | Domain Name | Primary Suites | Priority |
|-----------|-------------|----------------|----------|
| AUTH | Authentication & Registration | 01, 02 | P0/P1 |
| CATALOG | Catalog & Product Discovery | 01, 03, 16 | P0/P1 |
| SEARCH | Search | 03, 26 | P0/P1 |
| CART | Cart Operations | 01, 04 | P0 |
| CHECKOUT | Checkout Flows | 04 | P0 |
| PAYMENT | Payment Processing | 06 | P0 |
| ORDERS | Order Management | 01, 04, 20 | P0/P1 |
| BOPIS | Buy Online Pickup In Store | 05, 30 | P1 |
| QUOTES | B2B Quotes & RFQ | (none) | P1 |
| B2B-ORG | Multi-Organization | 02, 21 | P1 |
| B2B-MEMBERS | Company Members & Roles | 02, 21 | P1 |
| LISTS | Lists & Quick Order | 13 | P1/P2 |
| CONFIG | Product Configurations | 36 | P1 |
| VARIATIONS | Product Variations | 13 | P1 |
| WL | White Labeling | 32, 35 | P1/P2 |
| CMS | CMS & Page Builder | 25 | P1 |
| GA4 | Google Analytics | 07 | P2 |
| SECURITY | Security & Compliance | 08 | P0 |
| A11Y | Accessibility | 09 | P1 |
| L10N | Localization & Multi-Currency | 10 | P2 |
| PERF | Performance | 11 | P2 |
| BROWSER | Browser Compatibility | 12 | P1 |
| API-REST | Platform REST API | 14 | P0 |
| API-GQL | GraphQL xAPI | 15 | P1 |
| ADMIN-* | Admin Modules (16-34) | 16-34 | P1/P2 |

## Integration with Other Skills

| Direction | Skill | Relationship |
|-----------|-------|-------------|
| Upstream | `/qa-plan` | E2E scenario catalog provides expected coverage |
| Upstream | `/qa-checklist` | Domain checklists define expected test areas |
| Upstream | `/vc-frontend` | Sitemap provides page inventory |
| Upstream | `/vc-api` | API reference provides endpoint inventory |
| Downstream | `/qa-test` | Generated test cases can be executed via /qa-test |
| Downstream | `/qa-regression` | Updated suites feed into regression runs |
| Downstream | `/qa-metrics` | Coverage metrics updated post-generation |

## Rules

- Never create new suite files without explicit user approval — prefer appending to existing suites
- Always preserve existing test case IDs — new cases get next sequential ID in domain prefix
- Generated test cases must use deterministic steps (no "verify it looks correct" — specify what to check)
- P0 validation requires actual browser execution, not just review
- Gap analysis must reference business-logic.md invariants for priority scoring
- CSV format must match existing TestRail export format exactly
- Never hardcode environment URLs in test steps — use "Navigate to {FRONT_URL}" pattern
- All generated steps must be achievable by MCP browser automation (no manual-only steps)
- Mark any gap that requires new test data creation as `blocked:test-data`
- Output all reports to `reports/coverage/`
