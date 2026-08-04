---
name: qa-review-tests
description: "[Testing] Review test cases for quality, determinism, completeness, data validity, coverage gaps, duplication, live environment verification, and behavioral triangulation against docs + live + source. Delegates browser verification to qa-testing-expert; triangulation to ba-system-analyzer."
argument-hint: "suite <ID> | file <path> | diff | all | domain <name> | stale | --verify | --triangulate | --fix | --ci"

---

# /qa-review-tests — Test Case Review & Quality Verification

Review test cases against quality criteria to catch issues before regression runs: vague steps, missing preconditions, stale test data, coverage gaps, cross-suite duplication, and live environment verification. Delegates browser-based verification to `qa-testing-expert` agent.

## Usage
```
/qa-review-tests suite 015              # Review a specific suite by ID (static analysis)
/qa-review-tests file regression/suites/Frontend/orders/015-quotes.csv
/qa-review-tests diff                   # Review only git-changed test cases
/qa-review-tests all                    # Review every suite in config/test-suites.json (summary mode)
/qa-review-tests domain checkout        # Review all suites touching a domain
/qa-review-tests suite 015 --fix        # Review + auto-fix issues (asks before writing)
/qa-review-tests suite 015 --verify     # Static review + live environment verification via qa-testing-expert
/qa-review-tests suite 015 --verify --fix  # Full review + fix + verify
/qa-review-tests suite 015 --triangulate   # + Dim 11: is the asserted behavior still TRUE? (docs + live + source)
/qa-review-tests suite 015 --triangulate --fix       # + auto-apply CONFIRMED/DRIFT (asks first)
/qa-review-tests suite 015 --triangulate --fix --ci  # unattended: no prompt, PR review is the gate
/qa-review-tests stale                  # Order suites by staleness (oldest `Audited:` stamp first) and report the queue
```

## Supporting Files

- **review-criteria.md** — Full review criteria catalog with severity levels, check descriptions, and examples of good vs bad patterns.
- **triangulation-criteria.md** — Dimension 11: the per-axis evidence bar, the `docs: N/A` waiver, the suite→repo source-axis resolution chain, the verdict decision table, the auto-fix matrix, and the edit-safety rules.

## Review Dimensions (11)

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
| 10 | **Assertion Grounding** | Assertions asserting behavior with no source — ungrounded/`{HYPOTHESIS}`/untagged (GRD-001), invented literal message strings (GRD-002). Anti-hallucination gate; `--verify` grounds them live → `{OBSERVED}` | Blocker–Critical | Static + Live (`--verify`) |
| 11 | **Behavioral Triangulation** | Assertions whose expected behavior is **no longer true** — stale `{DOC}`, expired `{OBSERVED}`, retired `{BL}`, descoped `{SPEC}`. Triangulates each assertion against **docs + live + source** and assigns CONFIRMED / DRIFT / MISSING / CONTRADICTORY / UNGROUNDED / RETIRE (TRI-001…006) | Blocker–Medium | 3-axis (`--triangulate`) |

Dimensions 1-7 and 9 are **static analysis** (no browser needed). Dimension 8 requires `--verify` flag and delegates to `qa-testing-expert` agent for live browser verification. Dimension 10 is **static** for detecting ungrounded assertions but **needs `--verify`** to actually ground them (upgrade `{HYPOTHESIS}`/`{SPEC}` → `{OBSERVED}`). Dimension 11 requires `--triangulate` (which implies `--verify`) and delegates to `ba-system-analyzer` for the docs + source axes.

> **Dim 10 vs Dim 11 — the distinction that matters.** Dimension 10 checks that an assertion **carries** a grounded provenance tag. Dimension 11 checks that the tag is **TRUE**. `lint-test-cases.ts` GRD-001 passes a `{DOC}` tag pointing at a doc that changed, an `{OBSERVED}` tag captured against a build from six months ago, and a `{BL}` tag citing a retired invariant — all three lint green. Dim 11 is the only dimension that asks *"is this asserted behavior still true?"*, and it is the direct port of the `/qa-review-bl` triangulation mechanism to test cases.

> **`--verify` is MANDATORY before promoting a new-feature or ungrounded suite.** A suite that contains any `{HYPOTHESIS}` or unconfirmed-`{SPEC}` assertion (typical for a brand-new feature with no VirtoOZ doc / no source yet) cannot be promoted `Draft → Reviewed` on static review alone — the live `--verify` pass is the only step that can ground those assertions to `{OBSERVED}`. Fully `{BL}`/`{DOC}`/`{SPEC}`-grounded suites for existing features may promote on static review.

> **Run the deterministic linter first.** `npm run suites:review -- <csv>` (`scripts/test-cases/lint-test-cases.ts`)
> mechanises the rule-based core of dimensions **1–7, 9 and 10** — S-/D-/C-/T-/DV-/BL-/REQ-/DUP-/TC-/GRD-001
> checks as exact rules, plus **TRI-000** (`Audited:` stamp staleness, the Dim-11 rotation signal) — with
> `--json` for machine consumption and a `--fail-on` severity gate. It is the single
> source for these rules; DV-013 still runs via `validate-td-refs.ts` and DV-019 via `graphql:lint-labels`
> (the linter footer reminds you). Start every review by running it, then spend LLM effort only on what it
> can't decide: **Dimension 8** (live env, `--verify`), the fuzzy-edge calls it flags (C-008 order-vs-state
> nuance, DV-016 exact-value judgment, DUP near-duplicate intent), and the schema-aware DV-006…012 / BL-002 /
> BL-004/005 coverage rules that need knowledge-file cross-reference. The manual checklists in Step 3 below
> remain the reference for those judgment rules and as a fallback if the linter can't parse the file (it
> reports S-007 in that case).

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
| `all` | Read every suite CSV declared in `config/test-suites.json` → produce summary-level review (top issues per suite, not line-by-line) |
| `domain <name>` | Map domain to suites via `config/test-suites.json` tags → review those suites |
| `stale` | Run `npm run tc:audit:queue` → report the staleness-ordered suite queue (risk tier, then oldest `Audited:` stamp) and stop. Read-only; this is the scope-selection helper the scheduled audit uses to pick its suite |

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
- [ ] **GraphQL suites (050, graphql-tagged)**: validate all queries/mutations against `knowledge/api/graphql-schema.md`:
  - [ ] Query/mutation names exist in schema (DV-006)
  - [ ] All mutations use `command: { ... }` wrapper (DV-007)
  - [ ] Argument names match schema signatures (DV-008)
  - [ ] Response field names match return types (DV-009)
  - [ ] Input type fields are valid (DV-010)
  - [ ] MoneyType uses `currency { code }` not `currencyCode` (DV-011)
- [ ] Referenced products/SKUs exist in `test-data/` or use `{{TEST_SKU}}`
- [ ] Referenced org users use `{{ORG_USER_EMAIL}}` not hardcoded emails
- [ ] **Golden Rule — no hardcoded env-dependent values** (DV-013…DV-018, DV-020). Machine check: `npx tsx scripts/test-data/validate-td-refs.ts` (fails on hardcoded GUID/ID literals by default; `--warn-only` to downgrade):
  - [ ] No GUIDs/entity IDs for products/catalogs/categories/users/orgs/orders (DV-013) — use `@td()` resolver or runtime resolution
  - [ ] No fixture/alias column holding a volatile system GUID (DV-020) — reference by business key (`code`/`promo_name`/`slug`/`sku`); capture a system id at runtime, never persist it (the `gql_id` anti-pattern)
  - [ ] No literal SKUs / product names outside `test-data/` fixtures (DV-014) — use `{{TEST_SKU}}` or `@td(ALIAS.sku)`
  - [ ] No literal user emails outside `.env` vars or agent-user-pool slots (DV-015)
  - [ ] No exact-value assertions on env-dependent data (DV-016) — assert structural invariants (math identity, ordering, relation, shape/regex) instead of literal prices, order numbers, slugs, titles, counts
  - [ ] No literal addresses / coupon codes / fixture values outside `test-data/` (DV-017)
  - [ ] No magic numbers without named-constant comment (DV-018)
- [ ] **Exception — environment constants are allowed:** virtual-catalog root `fc596540...`, store ID, admin login, and other stable-across-deploys values documented in `knowledge/domain/catalog.md` or `knowledge/domain/store-settings.md`
- [ ] **Runner-native GraphQL step structure** (DV-019) — run `npm run graphql:lint-labels -- <csv-path>` for every GraphQL suite that uses `[GQL-OP]`/`[GQL-EXEC]` tags. Must exit 0. Catches:
  - [ ] Every `[GQL-OP <L>]` paired with exactly one `[GQL-EXEC <L>]`
  - [ ] Every `[GQL-EXEC <L>]` has a matching `[GQL-OP <L>]`
  - [ ] Every `[GQL-VARS <L>]` / `[GQL-CAPTURE <L>.*]` refers to a declared op label
- [ ] **Runner-native GraphQL authoring contract** — every runner-native row conforms to `knowledge/api/graphql-test-cases-runner.md` (canonical `Steps`/`Assertions`/`Cleanup` grammar, predicate shapes, `getByPath` filter syntax, `@td()` resolver, capture chaining, authoring checklist). Read this doc when in doubt about whether a tag, predicate, or path expression is supported by the runner.

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
| Behavioral Triangulation | N | ... | ... | ... | ... |
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

### Behavioral Triangulation (--triangulate only, Dimension 11)

Source axis resolved to: `<repo>` (via requiresModules → module-suite-map → fix-repos routing)

| Case ID | Assertion | Docs | Source | Live | Verdict | Action |
|---------|-----------|------|--------|------|---------|--------|
| QUOTE-003 | quote total excludes tax until approval | StorefrontUserGuide §Quotes | vc-module-quote/…/QuoteService.cs:141 | {OBSERVED} ✅ | CONFIRMED | stamp refreshed |
| QUOTE-007 | 'Request Quote' disabled for guests | N/A — implementation-detail: button-state UX | vc-frontend/…/QuoteButton.vue:38 | {OBSERVED} ✅ | DRIFT | assertion rewritten (was 'hidden', is 'disabled') |
| QUOTE-011 | decline emails the requester | PlatformUserGuide §Notifications | vc-module-quote/…/DeclineHandler.cs:66 | blocked — no SMTP on env | UNGROUNDED | proposal only |

Verdicts: CONFIRMED N | DRIFT N | MISSING N | CONTRADICTORY N | UNGROUNDED N | RETIRE N
Applied: N rows (stamp-only N, assertion rewrite N) | Proposals: N | `docs: N/A` rate: N/N

#### Proposals (never auto-applied)

| Case ID | Verdict | Conflicting / absent evidence | Recommended human action |
|---------|---------|-------------------------------|--------------------------|
| ... | CONTRADICTORY | source has fix @ abc123, live build trails | re-audit after next deploy |

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
6. **Asserted-behavior grounding (Dimension 10)** — For every `{HYPOTHESIS}` and unconfirmed-`{SPEC}` assertion, confirm the **behavior it claims actually happens** on the deployed build (the validation fires, the message/element appears, the computed value/state change occurs). This is the grounding path for a new feature. Confirmed → tag becomes `{OBSERVED}` (GRD-001 cleared); refuted → **ENV-008** (do not upgrade).

**Delegation protocol:**

```
Delegate to: qa-testing-expert (playwright-firefox)
Input: List of (case_id, url, elements_to_check, steps_to_walk, assertions_to_ground) from static review
Output: Per-case verification result:
  - VERIFIED: page loads, elements found, flow reachable
  - CHANGED: page loads but expected element missing or renamed → include screenshot
  - BROKEN: page returns error, redirect loop, or critical JS errors
  - BLOCKED: precondition cannot be met (user can't log in, feature disabled)
  - Per-assertion grounding: CONFIRMED (→ tag {OBSERVED}) | REFUTED (→ ENV-008, tag stays ungrounded)
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
- **REFUTED behavior** → Critical (ENV-008 — the asserted behavior isn't implemented; under `--fix`, rewrite to the observed behavior + tag `{OBSERVED}` or drop it)
- **CONFIRMED behavior** → No finding; under `--fix`, upgrade that assertion's provenance tag to `{OBSERVED}` (clears GRD-001)

### Step 7: Auto-Fix Mode (`--fix` flag)

> **Ordering is fixed:** static review (Steps 2–5) → live verification (Step 6) → triangulation (Step 8) → **then** one apply pass. When `--triangulate` is set, run Step 8 **before** applying, because a DRIFT rewrite needs the gathered evidence to rewrite *to*. Never apply fixes before the axes are gathered.

When `--fix` is specified:
1. Present the review report first (Step 5)
2. For each Blocker and Critical finding, propose a specific fix
3. **Ask for confirmation** before modifying any CSV file
4. Apply fixes to the CSV, preserving all existing IDs and non-affected columns
5. Re-run structure validation (Step 2) on the fixed file to confirm no regressions
6. Show a before/after diff of changes made

**`--ci` (unattended) branch.** With `--fix --ci` there is no human present, so step 3's prompt is skipped and the write scope **narrows** instead of widening:

| | interactive `--fix` | `--fix --ci` |
|---|---|---|
| Confirmation prompt | required | skipped — **the PR review is the gate** |
| Dim 1–7/9 structural fixes | applied on approval | applied (deterministic, linter-verified) |
| Dim 11 CONFIRMED / DRIFT | applied on approval | applied (three agreeing axes) |
| Dim 11 MISSING / CONTRADICTORY / UNGROUNDED / RETIRE | reported | reported — **never written** |
| `Automation_Status` promotion | human decision | **never** automatic |

`--ci` therefore holds a *narrower* privilege than interactive `--fix`: it may only apply what the linter proved deterministically or what three agreeing axes confirmed. After applying it MUST re-run the deterministic gate (`suites:review --fail-on=High`, `td:validate`, and `graphql:lint-labels` for GraphQL suites); an auto-fix that introduces a new Blocker/Critical is **reverted, not shipped**.

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

### Step 8: Behavioral Triangulation (`--triangulate` flag, Dimension 11)

Read **triangulation-criteria.md** (this folder) first — it holds the evidence bar, the `docs: N/A` waiver, the suite→repo resolution chain, the verdict table, and the auto-fix matrix. `--triangulate` implies `--verify` and reuses its budget caps.

**8a. Resolve the source axis.** For the suite in scope, resolve the backing repo: `config/test-suites.json` `requiresModules` → `.claude/knowledge/execution/module-suite-map.md` Module Map → `ci/config/fix-repos.json` `routing[]` (or `npm run tc:audit:source -- <ID>`). **Unresolvable ⇒ the source axis is ABSENT ⇒ every assertion in the suite is UNGROUNDED. Never guess a repo** — a wrong repo yields a confident `file:line` for unrelated code, manufacturing a false CONFIRMED.

> **One repo is the start of the source axis, not the whole of it.** Before treating the axis as satisfied, enumerate **every surface that can write the state you are asserting** and anchor each — storefront (`vc-frontend`), the module's **Admin SPA blade** (`…Web/Scripts/blades/*.js` — its toolbar commands and `canExecuteMethod`), the backend command handlers/constants, and any platform **setting** that constrains the value. A suite lives under `Frontend/`, but the state it asserts is usually cross-surface: auditing a frontend suite does **not** license a storefront-only model. See **triangulation-criteria.md §1c**, which carries the worked failure this rule came from, and **§1d** — a missing constant or key is a finding, never an explanation.

**8b. Fan out — PARALLEL (ba-system-analyzer).** Triangulation is read-only and per-assertion, so run it in parallel. Split the suite's cases into disjoint batches and dispatch **up to 3 `ba-system-analyzer` agents concurrently** (one Agent-tool call per batch, all in a single message — matches the 3-slot browser pool). Each gets its **own** browser slot (`playwright-firefox` / `playwright-chrome` / `playwright-edge`, never shared) and a **distinct test/org user** if the live axis needs auth (`feedback_concurrent_runners_distinct_org_users_taskstop`). Each agent captures all three axes with concrete evidence:

- **Docs axis** — `/vc-docs` (VirtoOZ MCP), topic-scoped tool per the source map. Capture a **quote + doc reference**.
- **Source axis** — GitHub MCP `search_code` / `get_file_contents` on the resolved repo (read-only; QA never clones). Capture a **`file:line` anchor**.
- **Live axis** — the agent's **own** assigned slot. Capture an **`{OBSERVED}` result + screenshot**. REAL-USER rule — no `browser_evaluate` / `run_code_unsafe` bypass. Do NOT sub-delegate to `qa-testing-expert` from inside a batch agent; that would exceed the 3-browser cap.

A batch agent **returns verdict + evidence tuple + proposed edit. It does NOT write the CSV.**

**8c. Assign verdicts.** Per assertion, via the decision table. CONFIRMED/DRIFT require an evidence tuple from every *applicable* axis, all agreeing. Apply the waivers: a structurally-unavailable axis is `N/A (<reason>)` and the bar becomes the remaining axes (**minimum two, all agreeing** — a lone axis never confirms). An applicable axis missing/blocked ⇒ UNGROUNDED; conflicting ⇒ CONTRADICTORY. **Deploy lag** (source shows a merged fix, live shows the old behavior) is CONTRADICTORY with a re-audit trigger, **never** a DRIFT. Roll a case up to its **worst** assertion verdict.

**8d. Apply — SINGLE WRITER.** Collect verdicts from all batch agents, then apply **serially in this one orchestrator process**. Per the auto-fix matrix: CONFIRMED → refresh the `Audited:` stamp only; DRIFT → rewrite **only the drifted assertion** + stamp; MISSING/CONTRADICTORY/UNGROUNDED/RETIRE → report only, never write. Stamp format, appended to the existing free-text `References` column (replacing any prior `Audited:` token, never accumulating):

```
Audited: <date> (TCA-<date>); Source: <repo>/<path>:<line>; Docs: <topic §section | N/A — <reason>>
```

A DRIFT rewrite must **keep `{{VAR}}` / `@td()` resolution** — rewriting an assertion to a literal price/SKU/URL observed live is a DV-013…020 violation, not a fix (assert the structural invariant, DV-016). This is the single most likely way an auto-fix does damage.

> **On a legacy untagged case, do NOT add a provenance tag to the assertion you rewrote.** Provenance is opt-in *per case*: one `{...}` tag makes the case provenance-adopted, and every untagged sibling then becomes a GRD-001 **High** — so tagging your one fix creates new findings and step 8e reverts it. Rewrite without a tag; the row-level `Audited:` stamp carries the evidence. See triangulation-criteria.md **§5 rule 4**.

**8e. Re-gate.** Re-run `suites:review -- <csv> --fail-on=High`, `td:validate`, and `graphql:lint-labels` (GraphQL suites). Any new Blocker/Critical ⇒ revert the applied edits.

## Rules

- **Read-only by default** — never modify CSV files without the `--fix` flag AND explicit user confirmation. The one exception is `--fix --ci` (unattended), where the confirmation is replaced by PR review and the write scope narrows to linter-proven + three-axis-confirmed edits only (Step 7).
- **Triangulation: parallel fan-out, single-writer fan-in.** Gather the three axes in parallel (≤3 browser agents, disjoint case batches, isolated sessions + distinct users), but apply from **one** serialized writer. Batch agents return proposed edits; they never write the CSV.
- **Triangulation auto-apply is gated by evidence, never by silence.** CONFIRMED/DRIFT land only with concrete, agreeing evidence from every applicable axis. A missing axis ⇒ UNGROUNDED ⇒ proposal. **When in doubt, UNGROUNDED, not `N/A`.**
- **Retiring and authoring are never automatic.** A RETIRE verdict never sets `Automation_Status: Deprecated` (it silently removes coverage if wrong); a MISSING verdict never fabricates a case (that is `/qa-test-lifecycle` Phase 3). Both are proposals.
- **A DRIFT rewrite must not regress the no-hardcode rule** — keep `{{VAR}}` / `@td()`; assert the structural invariant, not the literal value observed live (DV-016). Grounding in source may quote an i18n **key**, never a guessed rendering of it (GRD-002).
- **No false positives on legacy format** — if the CSV uses the legacy 11-column format, only check dimensions 1, 2, 4, and 7 (skip enriched-only columns)
- **Severity reflects real impact** — a missing `[WAIT]` after a mutation is Critical (causes flaky tests), a missing ECL ref is Medium (informational)
- **Actionable findings only** — every finding must include a specific suggested fix, not just "this is wrong"
- **Preserve IDs** — never suggest renumbering or changing test case IDs
- **Cross-suite duplication is expected across layers** — only flag duplication within the same layer/type
- **Peer review is mandatory (ISTQB)** — a case is not "ready for regression" until (a) `/qa-review-tests` returns verdict ≥ PASS WITH WARNINGS, (b) **every assertion is grounded** — zero GRD-001 (no `{HYPOTHESIS}`/untagged assertion), and for a new-feature/ungrounded suite a passing `--verify` run has upgraded those assertions to `{OBSERVED}`, AND (c) a human reviewer or `qa-lead-orchestrator` approves. Track review state via `Automation_Status` values: `Draft` (just generated, unreviewed), `Reviewed` (passed `/qa-review-tests` + grounded + peer-approved), `Automated`/`Manual`/`Semi-Automated` (execution mode — assumes Reviewed). Cases stuck in `Draft` MUST NOT be included in regression selections.

## Agent Delegation

| Agent | Role in Review | When | Browser |
|-------|---------------|------|---------|
| **qa-testing-expert** | Live environment verification (Dimension 8) — navigates pages, checks elements, walks flows | `--verify` flag | `playwright-firefox` |
| **ba-system-analyzer** ×N (≤3 parallel) | Triangulation batch (Dimension 11) — docs + source + live + verdict per assertion, on disjoint case batches | `--triangulate` flag | one distinct slot each: `playwright-firefox` / `playwright-chrome` / `playwright-edge` |
| the **orchestrator** (this skill) | Applies all CSV edits, serially — single writer | `--fix` | — |

The `qa-testing-expert` uses `playwright-firefox` for browser verification. This is its standard browser assignment — no conflict with other agents during review. The static review (Dimensions 1-7) does NOT require any agent delegation or browser.

**Concurrency cap: 3 browser agents total** (`.claude/rules/agents.md`). Under `--triangulate` each batch agent does its **own** live observation on its assigned slot — it does NOT additionally sub-delegate to `qa-testing-expert` (that would be a 4th browser). Reserve `qa-testing-expert` for a sequential single-case deep-dive on a hard live repro. Each parallel agent uses a distinct browser session **and** a distinct test user; never share.

**Workflow:**
1. Static review completes first (Dimensions 1-7, 9, static 10)
2. If `--verify` flag is set, extract verification targets from the static review findings and delegate to `qa-testing-expert`
3. If `--triangulate` is set, resolve the source repo, then fan out ≤3 `ba-system-analyzer` batches for the 3-axis evidence + verdicts (Step 8)
4. Merge environment verification and triangulation results into the final report
5. If `--fix` is set, apply serially from the orchestrator, then re-gate

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
| `/qa-test-lifecycle` | The **pipeline that embeds this skill** — complementary, not overlapping. It owns *when* review runs (Phase 4a = dims 1–7, 9, 10 static; Phase 5 = dim 8 + the live half of dim 10) and its own G1–G12 gates; **this skill remains the single owner of the dimension set, check codes, severities, and evidence bars**, and that command must reference them rather than restate them. Its Phase 2 change signal is a *single-axis candidate*: a rewrite of what a case **asserts** must clear this skill's Dim-11 bar (`--triangulate`, its Phase 4a-bis), while a mechanical selector/URL update may be applied directly. **Review never promotes `Automation_Status` itself** — the promotion flip is owned by an orchestrator, never this skill: that pipeline's Phase 6P (for handoff/re-promotion/legacy sources) and `/qa-test`'s own 5i gate (for its ticket cases, in-run). Either *derives* eligibility from this skill's output (0 GRD-001 Blocker/High, 0 ENV-008, every assertion grounded) and needs explicit human/`qa-lead` approval before flipping `Draft → Reviewed` (or `Draft → Automated` when the case ran green under the automated regression runner). The promotion rule below is that shared gate |
| `/qa-review-bl` | The **sibling triangulation mechanism** — same three axes, same evidence bar, applied to `BL-*` invariants instead of assertions. Its Step 4 reconciles coverage back into this skill; a `{BL}`-tagged assertion whose invariant it amended shows up here as a Dim 11 DRIFT |
| `ci/run-suite-audit.ts` | The **headless twin** — runs `--triangulate --fix --ci` on one suite per weekday and lands each audit as its own draft PR (`.github/workflows/suite-audit.yml`) |
