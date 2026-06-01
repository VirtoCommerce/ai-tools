---
description: "[Testing] Review test cases for quality, determinism, completeness, data validity, coverage gaps, duplication, and live environment verification. Delegates browser verification to qa-testing-expert."
argument-hint: "suite <ID> | file <path> | diff | all | domain <name> | --verify | --fix"
disable-model-invocation: true
---

# /qa-review-tests — Test Case Review & Quality Verification

Review test cases against quality criteria to catch issues before regression runs: vague steps, missing preconditions, stale test data, coverage gaps, cross-suite duplication, and live environment verification. Delegates browser-based verification to `qa-testing-expert` agent.

## Usage
```
/qa-review-tests suite 015              # Review a specific suite by ID (static analysis)
/qa-review-tests file regression/suites/Frontend/orders/015-quotes.csv
/qa-review-tests diff                   # Review only git-changed test cases
/qa-review-tests all                    # Review all 99 suites (summary mode)
/qa-review-tests domain checkout        # Review all suites touching a domain
/qa-review-tests suite 015 --fix        # Review + auto-fix issues (asks before writing)
/qa-review-tests suite 015 --verify     # Static review + live environment verification via qa-testing-expert
/qa-review-tests suite 015 --verify --fix  # Full review + fix + verify
```

## Supporting Files

- **review-criteria.md** — Full review criteria catalog with severity levels, check descriptions, and examples of good vs bad patterns.

## Review Dimensions (9)

| # | Dimension | What It Catches | Severity | Mode |
|---|-----------|----------------|----------|------|
| 1 | **Structure** | Malformed CSV, missing columns, empty required fields, invalid ID format | Blocker | Static |
| 2 | **Determinism** | Vague steps that two agents would execute differently; ambiguous assertions | Critical | Static |
| 3 | **Completeness** | Missing preconditions, empty assertions, no failure signals, missing cleanup, **implicit case ordering (C-008)** | High | Static |
| 4 | **Testability** | Assertions that can't be objectively verified ("looks correct", "works properly") | High | Static |
| 5 | **Data Validity** | Referenced `{{VAR}}` bindings, hardcoded URLs/credentials, stale SKUs, **GraphQL schema mismatches** (DV-006–DV-011: invalid operations, missing command wrapper, wrong args/fields), **thin happy-path field selection** (DV-012) | Blocker–High | Static |
| 6 | **BL/ECL Coverage + Requirement Traceability** | Missing `Business_Rule` refs, missing `Edge_Case_Refs` for relevant domains, uncovered BL-* invariants, **missing JIRA/REQ link for Critical/High (REQ-001)** | High–Medium | Static |
| 7 | **Duplication** | Overlapping test cases within the suite or across suites; **restated setup instead of `state from <ID>` reference (DUP-004)** | Medium | Static |
| 8 | **Environment Verification** | Steps reference UI elements/pages/flows that don't exist or have changed in the live environment | Critical | Live (`--verify`) |
| 9 | **Technique Coverage** | Feature group (shared `Section` parent or `References` ticket, ≥3 cases) missing the ISTQB positive + negative + boundary mix (TC-001) | Medium | Static |

Dimensions 1-7 and 9 are **static analysis** (no browser needed). Dimension 8 requires `--verify` flag and delegates to `qa-testing-expert` agent for live browser verification.

## Execution

### Step 0: Load References

Read these files to inform the review:
1. **`review-criteria.md`** — detailed criteria for each dimension (this skill folder)
2. **`test-case-template.md`** — the format contract (from `qa-test-cases-generator` skill)
3. **`business-logic.md`** — BL-* invariants to check coverage against
4. **`e-commerce-edge-cases-library.md`** — ECL-* patterns to check coverage against
5. **`test-data/`** directory — to validate referenced products/orgs exist

### Step 1: Determine Scope

| Argument | Action |
|----------|--------|
| `suite NN` | Read `config/test-suites.json` → find suite → read its CSV file |
| `file <path>` | Read the CSV file directly |
| `diff` | Run `git diff --name-only` → filter for `regression/suites/**/*.csv` → review only changed/added rows |
| `all` | Read all 99 suite CSVs → produce summary-level review (top issues per suite, not line-by-line) |
| `domain <name>` | Map domain to suites via `config/test-suites.json` tags → review those suites |

### Step 2: Parse & Validate Structure (Dimension 1)

For each CSV file:
1. Verify header row matches the 15-column enriched format OR the legacy 11-column format
2. For each row, check:
   - **ID** present and follows `PREFIX-NNN` pattern
   - **ID uniqueness** — no duplicate IDs within the file
   - **Title** non-empty
   - **Priority** is one of: `Critical`, `High`, `Medium`, `Low`
   - **Steps** non-empty
   - **Assertions** non-empty (enriched format) or **Expected Result** non-empty (legacy)
   - **No unescaped commas** inside fields that break CSV parsing
3. Count total cases, cases per section, cases per priority

### Step 3: Review Each Test Case (Dimensions 2-6)

For every test case row, evaluate:

#### Determinism (Dimension 2)
- [ ] Every step uses a type tag (`[NAV]`, `[ACT]`, `[WAIT]`, `[SCROLL]`, `[KEY]`, `[ASSERT]`)
- [ ] Steps reference specific UI elements by label or selector, not generic descriptions
- [ ] No ambiguous verbs: "check", "ensure", "validate" without specifying HOW
- [ ] `[WAIT]` follows every `[ACT]` that triggers a state change
- [ ] No compound steps (two actions in one line)

#### Completeness (Dimension 3)
- [ ] `Preconditions` describe the required starting **state** — not prior case execution (C-008)
- [ ] `Preconditions` do NOT contain "after running <ID>" / "requires <ID> to have passed" phrasing (C-008)
- [ ] `Test_Data` has `key={{VAR}}` bindings for all env-dependent values used in steps
- [ ] `Assertions` has at least 2 tagged assertions
- [ ] `Cross_Layer_Checks` present for any test that involves a mutation
- [ ] `Failure_Signals` has at least 2 signals (timeout + API/console)
- [ ] `Cleanup` specifies state restoration or explicitly says `none`
- [ ] Every GraphQL mutation has `errors[] is empty` in Cross_Layer_Checks

#### Testability (Dimension 4)
- [ ] No vague predicates: "page loads correctly", "works as expected", "displays properly"
- [ ] Every `[DOM]` assertion specifies WHAT element and WHAT property/text
- [ ] Every `[MATH]` assertion includes the formula
- [ ] Every `[STATE]` assertion specifies the expected value
- [ ] Assertions are falsifiable — an agent can unambiguously determine PASS or FAIL

#### Data Validity (Dimension 5)
- [ ] All `{{VAR}}` tokens are from the known env variable set (see `test-case-template.md`)
- [ ] No hardcoded URLs (e.g., `https://vcst-qa-storefront...`) — must use `{{FRONT_URL}}`
- [ ] No hardcoded credentials — must use `{{USER_EMAIL}}`, `{{USER_PASSWORD}}`
- [ ] **GraphQL suites (050, graphql-tagged)**: validate all queries/mutations against `agents/knowledge/graphql-schema.md`:
  - [ ] Query/mutation names exist in schema (DV-006)
  - [ ] All mutations use `command: { ... }` wrapper (DV-007)
  - [ ] Argument names match schema signatures (DV-008)
  - [ ] Response field names match return types (DV-009)
  - [ ] Input type fields are valid (DV-010)
  - [ ] MoneyType uses `currency { code }` not `currencyCode` (DV-011)
- [ ] Referenced products/SKUs exist in `test-data/` or use `{{TEST_SKU}}`
- [ ] Referenced org users use `{{ORG_USER_EMAIL}}` not hardcoded emails
- [ ] **Golden Rule — no hardcoded env-dependent values** (DV-013…DV-018):
  - [ ] No GUIDs/entity IDs for products/catalogs/categories/users/orgs/orders (DV-013) — use `@td()` resolver or runtime resolution
  - [ ] No literal SKUs / product names outside `test-data/` fixtures (DV-014) — use `{{TEST_SKU}}` or `@td(ALIAS.sku)`
  - [ ] No literal user emails outside `.env` vars or agent-user-pool slots (DV-015)
  - [ ] No exact-value assertions on env-dependent data (DV-016) — assert structural invariants (math identity, ordering, relation, shape/regex) instead of literal prices, order numbers, slugs, titles, counts
  - [ ] No literal addresses / coupon codes / fixture values outside `test-data/` (DV-017)
  - [ ] No magic numbers without named-constant comment (DV-018)
- [ ] **Exception — environment constants are allowed:** virtual-catalog root `fc596540...`, store ID, admin login, and other stable-across-deploys values documented in `knowledge/catalog.md` or `knowledge/store-settings.md`
- [ ] **Runner-native GraphQL step structure** (DV-019) — run `npm run graphql:lint-labels -- <csv-path>` for every GraphQL suite that uses `[GQL-OP]`/`[GQL-EXEC]` tags. Must exit 0. Catches:
  - [ ] Every `[GQL-OP <L>]` paired with exactly one `[GQL-EXEC <L>]`
  - [ ] Every `[GQL-EXEC <L>]` has a matching `[GQL-OP <L>]`
  - [ ] Every `[GQL-VARS <L>]` / `[GQL-CAPTURE <L>.*]` refers to a declared op label
- [ ] **Runner-native GraphQL authoring contract** — every runner-native row conforms to `.claude/agents/knowledge/graphql-test-cases-runner.md` (canonical `Steps`/`Assertions`/`Cleanup` grammar, predicate shapes, `getByPath` filter syntax, `@td()` resolver, capture chaining, authoring checklist). Read this doc when in doubt about whether a tag, predicate, or path expression is supported by the runner.

#### BL/ECL Coverage + Requirement Traceability (Dimension 6)
- [ ] `Business_Rule` column populated with valid `BL-*` IDs (unless pure UI test)
- [ ] `BL-*` IDs exist in `business-logic.md`
- [ ] `Edge_Case_Refs` populated for domains that have ECL patterns
- [ ] For P0/Critical cases: at least one `BL-*` rule mapped
- [ ] Cross-reference: are there BL-* invariants for this domain with no test cases covering them?
- [ ] **For Critical/High cases, `References` contains a JIRA ticket (`VCST-XXXX`), `REQ-*` ID, or user-story link (REQ-001)** — a lone `BL-*` in References does NOT satisfy this
- [ ] Infrastructure/smoke cases with no originating ticket use `References: smoke-baseline` (explicit placeholder, never empty)

### Step 3.5: Runner-Native GraphQL Label Pairing (Dimension 5 — DV-019)

When the scope includes any file under `regression/suites/Backend/graphql/` (or any CSV that declares `[GQL-OP]`/`[GQL-EXEC]` in Steps), run the label-pairing linter as a deterministic structural check:

```bash
npm run graphql:lint-labels -- <csv-path>
```

Merge the output into the Data Validity dimension (DV-019 for label mismatches, S-007 for CSV-parse errors the linter surfaces while reading). The linter automatically skips legacy GraphiQL-UI cases (no `[GQL-OP]` tags), so this check is safe to run against mixed suites and does not require a live environment.

Severity rules:
- DV-019 findings → **Critical** (runner will exit at structural validation before any GraphQL is sent; case is dead code)
- S-007 findings → **Blocker** (CSV-parse error; the whole file cannot be read reliably)

### Step 4: Cross-Suite Duplication Check (Dimension 7)

Compare test cases across suites in the same domain:
1. Extract (Title, Section, Steps summary) tuples from all suites in scope
2. Flag cases where two different suites test the same scenario (>80% step overlap)
3. Flag cases where the same BL-* invariant is tested identically in multiple suites (acceptable if different layers)
4. **Within a single suite**, detect cases whose first ≥70% of tagged Step lines duplicate another earlier case's setup sequence — emit **DUP-004** recommending a `Preconditions: state from <ID>` preamble instead of the restated flow
5. Note: duplication across layers (storefront vs API vs admin) is EXPECTED and NOT a finding

### Step 4b: Technique Coverage Check (Dimension 9)

Applied per **feature group**, not per individual case. A feature group is the set of cases sharing the same `Section` parent (e.g., `Cart > Add`, `Payment > CyberSource`) OR the same ticket in `References`.

1. Group cases by `Section` parent; fall back to `References` grouping when Section has only one level.
2. For every group with **≥3 cases**, check the mix:
   - **Positive** — at least 1 case whose Title contains no `error`, `invalid`, `expired`, `rejected`, `fail`, `denied` keyword and whose Steps end with a successful state assertion.
   - **Negative** — at least 1 case testing invalid input, permission denial, expired state, or an error path.
   - **Boundary** — at least 1 case at the edge of an ordered input (quantity, price, date range, string length, pagination) **if** the feature has any such input. Waived if the feature has no ordered inputs (e.g., pure flag toggle, lookup by ID).
3. Emit **TC-001** (Medium) for each group missing one or more of {positive, negative, boundary}. Include the feature group name, missing technique(s), and a seed Title suggestion for the gap case (e.g., `Cart > Coupon — add: expired-coupon rejection case`).
4. Skip groups with <3 cases — they are assumed to be narrow scope and exempt from the mix requirement.

### Step 5: Generate Review Report

Output a structured report:

```markdown
## Test Case Review Report

**Scope:** [suite/file/diff/all]
**Date:** {{currentDate}}
**Total Cases Reviewed:** N
**Format:** [enriched 15-col | legacy 11-col | mixed]

### Summary

| Dimension | Findings | Blocker | Critical | High | Medium |
|-----------|----------|---------|----------|------|--------|
| Structure | N | ... | ... | ... | ... |
| Determinism | N | ... | ... | ... | ... |
| Completeness | N | ... | ... | ... | ... |
| Testability | N | ... | ... | ... | ... |
| Data Validity | N | ... | ... | ... | ... |
| BL/ECL Coverage + Req Traceability | N | ... | ... | ... | ... |
| Duplication | N | ... | ... | ... | ... |
| Env Verification | N | ... | ... | ... | ... |
| Technique Coverage | N | — | — | — | ... |
| **Total** | **N** | **X** | **X** | **X** | **X** |

### Verdict: [PASS | PASS WITH WARNINGS | NEEDS FIXES]

[PASS = 0 blockers, 0 critical; PASS WITH WARNINGS = 0 blockers, <=3 critical; NEEDS FIXES = any blocker or >3 critical]

### Findings by Severity

#### Blockers (must fix before regression run)
| Case ID | Dimension | Issue | Suggested Fix |
|---------|-----------|-------|---------------|
| ... | ... | ... | ... |

#### Critical (should fix before regression run)
| Case ID | Dimension | Issue | Suggested Fix |
|---------|-----------|-------|---------------|

#### High (fix when convenient)
| Case ID | Dimension | Issue | Suggested Fix |
|---------|-----------|-------|---------------|

#### Medium (informational)
| Case ID | Dimension | Issue | Suggested Fix |
|---------|-----------|-------|---------------|

### Coverage Gaps

BL-* invariants in this domain with no corresponding test cases:
- BL-XXX-NNN: [rule description] — **no test case found**

ECL-* patterns relevant to this domain but not referenced:
- ECL-X.X: [pattern] — **not covered**

### Technique Coverage Gaps (Dimension 9 — TC-001)

Feature groups missing ISTQB positive + negative + boundary mix:
| Feature Group | Cases | Has Positive | Has Negative | Has Boundary | Seed Title for Gap |
|---------------|-------|--------------|--------------|--------------|--------------------|
| Cart > Coupon | 5 | ✅ | ❌ | ❌ | Cart > Coupon — Expired Coupon Rejected; Cart > Coupon — Max Discount Cap Boundary |
| ... | ... | ... | ... | ... | ... |

### Duplication Candidates

| Case A | Case B | Suite A | Suite B | Overlap | Recommendation |
|--------|--------|---------|---------|---------|----------------|
| ... | ... | ... | ... | ~85% | Consolidate into Case A |

### Environment Verification (--verify only)

| Case ID | URL | Check | Result | Screenshot | Notes |
|---------|-----|-------|--------|------------|-------|
| QUOTE-001 | /cart | 'Request Quote' button | VERIFIED | — | — |
| ORD-009 | /account/orders/{id} | 'Return' button | CHANGED | env-ord009.png | Button renamed to 'Request Return' |
| ... | ... | ... | ... | ... | ... |

Pages visited: N | Elements checked: N | Flows walked: N
Verified: N | Changed: N | Broken: N | Blocked: N

### Statistics

- Cases by priority: Critical: N | High: N | Medium: N | Low: N
- Cases with BL-* mapping: N/N (X%)
- Cases with ECL-* refs: N/N (X%)
- Cases with >=2 failure signals: N/N (X%)
- Cases with cleanup defined: N/N (X%)
- Average assertions per case: X.X
```

### Step 6: Environment Verification (`--verify` flag, Dimension 8)

When `--verify` is specified, delegate live browser verification to the **`qa-testing-expert`** agent (`playwright-firefox`). This step runs AFTER the static review (Steps 2-5) is complete.

**What `qa-testing-expert` verifies:**

1. **Page reachability** — Navigate to each unique URL referenced in Steps/Preconditions, confirm pages load (no 404, no 500, no redirect loops)
2. **UI element existence** — For P0/Critical cases, verify that key UI elements referenced in Steps and Assertions actually exist on the page:
   - Buttons mentioned in `[ACT] click 'Button Name'` steps
   - Form fields mentioned in `[ACT] fill 'Field Name'` steps
   - Navigation links mentioned in `[NAV]` steps (sidebar links, menu items)
   - Status badges, labels, or text mentioned in `[DOM]` assertions
3. **Flow walkability** — For the top 3-5 highest-priority cases, walk through the first 3-4 steps to verify the happy path is reachable (not a full test execution — just confirming the flow still works)
4. **Precondition validity** — Verify precondition state exists:
   - Required user accounts can log in
   - Referenced pages/sections exist in the account area
   - Features mentioned in preconditions are enabled (e.g., "RFQ feature enabled", "return/RMA feature enabled")
5. **Console/network baseline** — Capture console errors and failed network requests on each visited page as baseline health signal

**Delegation protocol:**

```
Delegate to: qa-testing-expert (playwright-firefox)
Input: List of (case_id, url, elements_to_check, steps_to_walk) from static review
Output: Per-case verification result:
  - VERIFIED: page loads, elements found, flow reachable
  - CHANGED: page loads but expected element missing or renamed → include screenshot
  - BROKEN: page returns error, redirect loop, or critical JS errors
  - BLOCKED: precondition cannot be met (user can't log in, feature disabled)
```

**Verification scope limits:**
- Max 20 unique pages per review (deduplicate across cases)
- Max 5 full flow walkthroughs (P0/Critical cases only)
- Timeout: 60s per page, 5 min total verification budget
- Screenshot on every CHANGED or BROKEN finding

**Environment verification findings feed into the review report** as Dimension 8 rows with their own severity:
- **BROKEN** → Blocker (test case will fail on execution — fix steps or preconditions)
- **CHANGED** → Critical (element renamed or moved — update selectors/labels)
- **BLOCKED** → High (precondition issue — may be environment-specific, not a test case defect)
- **VERIFIED** → No finding (test case is environment-compatible)

### Step 7: Auto-Fix Mode (`--fix` flag)

When `--fix` is specified:
1. Present the review report first (Step 5)
2. For each Blocker and Critical finding, propose a specific fix
3. **Ask for confirmation** before modifying any CSV file
4. Apply fixes to the CSV, preserving all existing IDs and non-affected columns
5. Re-run structure validation (Step 2) on the fixed file to confirm no regressions
6. Show a before/after diff of changes made

Fixable issues (auto-fix supported):
- Missing type tags on steps → infer and add tags
- Missing `errors[]` check → add to Cross_Layer_Checks
- Hardcoded URLs → replace with `{{VAR}}` equivalents
- Empty `Failure_Signals` → generate from Assertions + Cross_Layer_Checks
- Missing `Cleanup` → infer from test actions (mutations → cleanup, read-only → `none`)

Non-fixable issues (flagged for manual review):
- Vague assertions → requires domain knowledge to make specific
- Missing preconditions → requires understanding of test flow
- Duplicate test cases → requires human decision on which to keep
- Missing BL-*/ECL-* refs → requires domain analysis

## Rules

- **Read-only by default** — never modify CSV files without the `--fix` flag AND explicit user confirmation
- **No false positives on legacy format** — if the CSV uses the legacy 11-column format, only check dimensions 1, 2, 4, and 7 (skip enriched-only columns)
- **Severity reflects real impact** — a missing `[WAIT]` after a mutation is Critical (causes flaky tests), a missing ECL ref is Medium (informational)
- **Actionable findings only** — every finding must include a specific suggested fix, not just "this is wrong"
- **Preserve IDs** — never suggest renumbering or changing test case IDs
- **Cross-suite duplication is expected across layers** — only flag duplication within the same layer/type
- **Peer review is mandatory (ISTQB)** — a case is not "ready for regression" until (a) `/qa-review-tests` returns verdict ≥ PASS WITH WARNINGS, AND (b) a human reviewer or `qa-lead-orchestrator` approves. Track review state via `Automation_Status` values: `Draft` (just generated, unreviewed), `Reviewed` (passed `/qa-review-tests` + peer-approved), `Automated`/`Manual`/`Semi-Automated` (execution mode — assumes Reviewed). Cases stuck in `Draft` MUST NOT be included in regression selections.

## Agent Delegation

| Agent | Role in Review | When |
|-------|---------------|------|
| **qa-testing-expert** | Live environment verification (Dimension 8) — navigates pages, checks elements, walks flows | `--verify` flag |

The `qa-testing-expert` uses `playwright-firefox` for browser verification. This is its standard browser assignment — no conflict with other agents during review. The static review (Dimensions 1-7) does NOT require any agent delegation or browser.

**Workflow:**
1. Static review completes first (Dimensions 1-7)
2. If `--verify` flag is set, extract verification targets from the static review findings
3. Delegate to `qa-testing-expert` with the list of pages, elements, and flows to check
4. Merge environment verification results into the final report

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `/qa-test-cases-generator` | Review generated cases before appending to suites |
| `/qa-coverage-gap` | Review newly generated gap-fill cases |
| `/qa-checklist` | Checklists define expected coverage — review checks against them |
| `/qa-regression` | Run review before regression to catch issues early |
| `/qa-metrics` | Review findings feed into quality metrics |
| `/qa-env-check` | Run env check before `--verify` to ensure environment is healthy |
| `test-case-template.md` | The format contract that review validates against |
