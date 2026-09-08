# Coverage Gap Methodology

Contract for `/qa-coverage-gap`. Defines gap detection, scoring, and generation rules. The format contract for generated cases lives in [`test-case-template.md`](../qa-test-cases-generator/test-case-template.md) — this file does not redefine columns or tags.

## Gap Detection Heuristics

### 1. Feature Inventory Comparison
Compare the complete feature inventory (sitemap, API/GraphQL reference, business logic invariants, edge-case library, domain checklists) against existing test case titles, sections, and `Business_Rule`/`Edge_Case_Refs` columns. A gap exists when:
- A user-facing page has zero test cases targeting it
- A REST endpoint or GraphQL operation has zero test cases exercising it
- A `BL-*` invariant has no test case verifying it
- An `ECL-*` edge case has no test case covering it
- A user flow from the E2E scenario catalog has no corresponding regression test
- A test case exists in the **TestRail exports** (`test-suites ( export from Test-rail )/`) but has no counterpart in `regression/suites/` — see §1b

### 1b. TestRail Cross-Reference
Compare current regression suites against the original TestRail exports to detect migration gaps:
1. Read TestRail exports from `test-suites ( export from Test-rail )/Frontend/` and `Backend (admin site)/`
2. For each TestRail test case (by `Title + Section`), check if a corresponding case exists in `regression/suites/`
3. Flag cases present in TestRail but absent from regression suites as `MIGRATION_GAP`
4. Flag cases where TestRail steps are richer (more assertions, more edge cases) than the regression version as `SHALLOW_MIGRATION`
5. Use TestRail original test intent to inform gap generation — preserve the original tester's coverage design

### 2. Coverage Depth Assessment
Even when test cases exist, assess depth:
- **Shallow coverage**: Only happy path tested, no error/edge cases
- **Missing negative tests**: No invalid input, boundary, or error path tests
- **Missing integration tests**: Feature tested in isolation but not end-to-end
- **Missing cross-domain tests**: Feature works alone but not verified after related feature changes
- **Missing layer coverage**: Feature exposed at multiple layers (e.g., REST + GraphQL + Admin UI) but only one layer is tested

### 3. Priority Scoring Matrix

| Factor | Weight | Scoring |
|--------|--------|---------|
| Revenue impact | 40% | P0=10, P1=6, P2=3 |
| User frequency | 25% | Daily=10, Weekly=6, Monthly=3, Rare=1 |
| Failure severity | 20% | Data loss=10, Functional=7, UX=4, Cosmetic=1 |
| Existing coverage | 15% | Zero=10, 1–2 cases=7, 3–5=4, 6+=1 |

**Priority assignment:**
- Score 8.0–10.0 → P0 (Critical) — must fix immediately
- Score 5.0–7.9 → P1 (High) — fix this sprint
- Score 2.0–4.9 → P2 (Medium) — plan for next sprint
- Score < 2.0 → P3 (Low) — backlog, excluded from generation runs

**Tie-breakers** (when two gaps are within ±0.5):
1. Defer to `/qa-risk` 5×5 matrix (likelihood × impact)
2. Prefer the gap that closes a `MIGRATION_GAP` over one that adds new depth
3. Prefer the gap with a documented `BL-*` invariant over one without

### 4. Gap Categories

| Category | Description | Example |
|----------|-------------|---------|
| `ZERO_COVERAGE` | Feature exists with absolutely no tests | Bulk Order page has no test cases |
| `SHALLOW_HAPPY` | Only happy path, no errors/edges | Cart add tested, but not "add out-of-stock" |
| `MISSING_NEGATIVE` | No negative/error test cases | Payment form tested with valid card, not invalid |
| `MISSING_INTEGRATION` | Feature works alone, not tested in flow | Search tested, but not "search → add to cart → checkout" |
| `MISSING_CROSS_DOMAIN` | No cascade verification | Admin price change not verified on storefront |
| `MISSING_LAYER` | Layer-specific coverage absent | xAPI mutation has UI test but no GraphQL-runner test |
| `STALE_COVERAGE` | Tests exist but may be outdated | Test references removed UI element |
| `MIGRATION_GAP` | Test exists in TestRail export but missing from regression suites | TestRail has "C389061 Registration form > PERSONAL" but no match in `Frontend/auth/032-registration.csv` |
| `SHALLOW_MIGRATION` | Regression case exists but lost depth vs TestRail original | TestRail has 5 steps with assertions, regression has 2 steps |

## Test Case Generation Rules

### Format Contract
Every generated case MUST conform to [`test-case-template.md`](../qa-test-cases-generator/test-case-template.md) — the 15-column enriched CSV (ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status).

**For Backend/graphql/* suites (`050a`–`050k`):** authoring contract is [`graphql-test-cases-runner.md`](../../knowledge/api/graphql-test-cases-runner.md) — runner-native tags only (`[AUTH]/[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]/[REST-OP|EXEC|CAPTURE]/[ERRORS]/[DATA]/[NULL]/[COUNT]/[VAR]`). Browser-mode `[GQL]` tags are invalid in these suites.

### ID Assignment
- Use domain prefix + sequential number: `{DOMAIN}-{NNN}`
- Start numbering after the highest existing ID in the target suite
- Domain prefixes follow `feature-domain-map.md` (e.g., `CART-`, `CHK-`, `QUOTE-`, `BULK-`, `DASH-`, `CFG-`)

### Mandatory Column Population
- **`Business_Rule`** — at least one `BL-*` invariant from `business-logic.md` (the rule being verified). Empty `Business_Rule` is a review failure.
- **`Edge_Case_Refs`** — for negative/edge-case cases, populate at least one `ECL-*` from `e-commerce-edge-cases-library.md`.
- **`Test_Data`** — resolve via `{{VAR}}` / `@td()` / `live-discover` / `random-data` per [`.claude/rules/test-data.md`](../../rules/test-data.md). Literal IDs/SKUs/emails/prices/order-numbers/paths are review failures. Use `AGENT-TEST-` prefix for generated entities.
- **`Assertions`** — predicate-driven (`[STATUS]/[DATA]/[DOM]/…`), never "verify it looks correct".
- **`Failure_Signals`** — explicit observable signals (HTTP code, console error, DOM state) that indicate the test caught a real regression.
- **`Cleanup`** — for any case that creates persistent entities, document the teardown.

### Step Writing Rules
- Each step uses a typed tag from `test-case-template.md` Step-Type Tags (`[NAV]/[ACT]/[ASSERT]/[HTTP]/[GQL-*]/[BLADE]/…`).
- Use imperative verbs: "Navigate to", "Click", "Enter", "Verify", "Wait for".
- Reference elements by visible text, accessible role, or stable test ID — never CSS class selectors that may rotate.
- Include explicit wait conditions where relevant (`[WAIT]` tag).
- Use `{FRONT_URL}` / `{BACK_URL}` / `{STOREFRONT_URL}` placeholders; never hardcode hosts.
- For GraphQL-runner cases, follow the `[GQL-OP]+[GQL-VARS]+[GQL-EXEC]+[GQL-CAPTURE]` sequence per the runner-native contract.

### Test Type Guidance
- **Happy path** is mandatory for every feature.
- Add at least one **negative/error** path per P0 feature.
- Add at least one **integration/E2E** case when the feature spans ≥2 manifest domains (mark with `--- LAYER ---` markers per `test-case-template.md`).
- For B2B features, include **org-isolation** verification (cart, pricing, members must not bleed across orgs).

### Quality Checklist (pre-append)
Each generated case must satisfy:
- [ ] Conforms to `test-case-template.md` (all 15 columns present, correct order)
- [ ] Unique ID with domain prefix
- [ ] References at least one `BL-*` invariant
- [ ] Test data uses `{{VAR}}` / `@td()` / `live-discover` / `random-data` only
- [ ] Steps use typed tags; assertions are predicate-driven
- [ ] Preconditions describe user state, data requirements, env requirements
- [ ] `Failure_Signals` lists observable signals
- [ ] `Cleanup` populated when entities are created
- [ ] `Automation_Status` initialized to `pending` (becomes `validated`/`needs-review` after Cycle 3)
- [ ] No semantic duplicate of an existing case in the target suite (matching `Title + Section` OR `Steps + Assertions`)

## Validation Protocol

### Browser Validation (Cycle 3)
1. Open browser via the agent's assigned slot per `.claude/templates/agent-dispatch.md` § Default Assignments. Default for the single-agent skill: `playwright-chrome` (fallback: `playwright-firefox`).
2. Navigate to the starting URL (resolve from `{FRONT_URL}` / `{BACK_URL}`).
3. Execute each step literally per its typed tag.
4. At each `[ASSERT]`/`[STATUS]`/`[DATA]`/`[DOM]` step, verify the predicate.
5. If a step fails:
   - Capture screenshot + console + network HAR per `skills/qa-evidence/evidence-capture-policy.md`
   - Determine whether it's a test-case defect or an app bug
   - Test-case defect → revise once and re-run; if still failing, mark `Automation_Status = needs-review` with a Failure_Signal note
   - App bug → mark `Automation_Status = validated` (test correctly caught the bug) and file a bug report
6. Record outcome in `Automation_Status`.

### GraphQL Runner Validation (Backend/graphql/050a-k)
1. Execute via `npx tsx scripts/graphql/graphql-runner.ts --case <csv>:<ID>` — never via custom JS scripts (see `feedback_use_canonical_graphql_runner` memory).
2. The runner performs schema validation, variable substitution, and evidence capture automatically.
3. Failure recovery: same as browser validation but without screenshots.

### Static Validation (always)
- `npx tsx scripts/test-data/validate-td-refs.ts` — every `@td()` reference must resolve. Failure blocks Cycle 3.
- For suites in critical-UI scope: `npm run scope:validate` must exit 0 before Cycle 4 commits.

### Cleanup
- Any test data created with the `AGENT-TEST-` prefix is reclaimed by `/qa-seed-data teardown`.
- Validation must invoke its own cleanup if a case creates persistent entities (org, list, order). Do not rely on global teardown alone within a validation pass.

### Validation Priorities
- **P0 cases**: MUST validate every case (single-agent skill) or every P0 across batches (orchestrated command). Pass rate target ≥ 80% before quality gate accepts the run.
- **P1 cases**: validate at least the happy-path case per domain.
- **P2 cases**: skip browser validation (review only); static validation still applies.

## Test-Data Contract Summary

Per `.claude/rules/test-data.md`:

| Layer | Source | Use for |
|-------|--------|---------|
| `{{VAR}}` | `.env` (33 vars) | URLs, credentials, store/culture context |
| `@td(ALIAS.field)` | `test-data/aliases.json` → CSV row | Named entities asserted by name (canonical product, known coupon, fixed org) |
| `live-discover` | `scripts/lib/live-discover.ts` or `[GQL-OP]+[GQL-CAPTURE]` | Drifting entities — assert shape, not exact values |
| `random-data` | `scripts/lib/random-data.ts` | Unique inputs (emails, org names, comments) — `AGENT-TEST-` prefix by default |

The decision tree is in [`knowledge/execution/live-discovery.md`](../../knowledge/execution/live-discovery.md) — consult before authoring any case that touches a product, address, cart, coupon, or user entity.

---

## `gap-inventory.json` — record schema and Step-1 contract

> Carried over on 2026-09-08 from the removed `/qa-coverage-generation` command (its orchestrated
> multi-agent mode had zero recorded runs; `/qa-coverage-gap` is now the one coverage pipeline) and
> rewritten for a single-agent skill: the `MAX_BUDGET_USD` guard, the `sprint` scope and the
> orchestrator / sub-agent split went with the command. What survives is the source order and the record
> shape, because every later step reads this file instead of re-reading the suites.

**Before Step 1 (pre-flight):**

1. **Duplicate-run guard** — read `reports/coverage/` for runs in the last 7 days matching the requested scope. If a match exists, warn the user and ask before continuing.
2. **Environment health** — `curl -sk {BACK_URL}/health` (CI may skip; record the verdict).
3. **Manifest sanity** — confirm `config/test-suites.json` loads, `_meta.version >= 3.0`, and the selection rule for the requested scope resolves.

If any check fails, surface it with a one-line summary and ask whether to proceed.

**Step 1 — gap analysis runs ONCE, up front, in this skill's own session.** Generation, validation and
reporting all consume `gap-inventory.json`; none of them re-reads the suites.

**Sources (read in this order):**

1. **Current regression coverage** — every suite CSV referenced in `config/test-suites.json` (`suites[*].file`). Routing fields: `domain`, `layer`, `concern`, `priority`.
2. **Baseline TestRail exports** — `test-suites ( export from Test-rail )/` (Frontend26-02, frontend-26-01, suites/, Backend (admin site)/, E2E/) — flag `MIGRATION_GAP` / `SHALLOW_MIGRATION` per `coverage-gap-methodology.md` §1b.
3. **Feature inventory** — all of:
   - `knowledge/oracles/business-logic.md` (`BL-*` invariants)
   - `knowledge/oracles/e-commerce-edge-cases-library.md` (`ECL-*`)
   - `knowledge/domain/sitemap.md`
   - `knowledge/execution/module-suite-map.md`
   - `knowledge/api/graphql-schema.md`
   - `knowledge/domain/products.md`, `catalog.md`, `store-settings.md`
   - `skills/qa-plan/e2e-scenario-catalog.md` (105 E2E scenarios)
   - `skills/qa-checklist/domain-checklists.md` (UI/UX)
   - `skills/qa-checklist/backend-admin-checklists.md`
   - `skills/qa-checklist/graphql-checklist.md`
   - `skills/qa-api/xapi-query-ref.md`
   - `skills/qa-api/test-cases-api-graphql.md`
   - `skills/qa-coverage-gap/feature-domain-map.md`
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
   - All tools accept `{ query, top_k: 3-5 }`. See `agent-dispatch.md` § "Sample Queries by Domain" for query stems and full routing rules in `skills/vc-docs/SKILL.md`.
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

