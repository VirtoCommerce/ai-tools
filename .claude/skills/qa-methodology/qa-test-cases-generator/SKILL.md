---
description: "[QA Method] Generate agent-native test cases in enriched CSV format from JIRA tickets, features, checklists, or existing suites. Uses business logic invariants and edge case library."
argument-hint: "VCST-XXXX | domain | suite ID | migrate <suite> | from-checklist <domain>"
---

# /qa-test-cases-generator — Agent-Native Test Case Generation

Generate structured test cases in the enriched CSV format defined by `test-case-template.md`. Produces test cases that AI agents can execute directly via MCP browser tools — with typed steps, explicit assertions, cross-layer checks, and failure signals.

## Usage
```
/qa-test-cases-generator VCST-4565              # Generate from JIRA ticket (auto-detects layers)
/qa-test-cases-generator cart                    # Generate for a domain (all layers)
/qa-test-cases-generator suite 06               # Extend existing suite with new cases
/qa-test-cases-generator migrate 04             # Migrate legacy suite to enriched format
/qa-test-cases-generator from-checklist payment  # Generate from domain checklist items
/qa-test-cases-generator from-bdd "Given user has items in cart, When they apply coupon..."

# Layer-specific generation
/qa-test-cases-generator VCST-4565 --layer api        # REST API tests only
/qa-test-cases-generator VCST-4565 --layer graphql     # GraphQL xAPI tests only
/qa-test-cases-generator VCST-4565 --layer admin       # Admin UI tests only
/qa-test-cases-generator VCST-4565 --layer e2e         # E2E cross-layer flows only
/qa-test-cases-generator VCST-4565 --layer all         # All layers (default for tickets)
/qa-test-cases-generator coupons --layer api,graphql   # Multiple specific layers
```

## Supporting Files

- **test-case-template.md** — Enriched CSV column spec with step type tags, assertion predicates, cross-layer checks, failure signals. **Read this first — it is the format contract.**
- **test-case-examples.md** — Concrete examples per layer (REST API, GraphQL, Admin UI, E2E). Read when you need a reference output for a specific layer.

## Cross-Agent Knowledge (`.claude/agents/knowledge/`)

Load these references during generation:
- **business-logic.md** — `BL-*` invariant IDs to populate `Business_Rule` column
- **e-commerce-edge-cases-library.md** — `ECL-*` IDs to populate `Edge_Case_Refs` column
- **catalog.md**, **store-settings.md** — Product types, store config for realistic test data
- **platform-patterns.md** — Common platform behaviors to inform assertions

## Execution

### Step 0: Load the Template
Read `test-case-template.md` from this skill folder. This defines all 15 CSV columns, type tags, assertion tags, and writing guidelines. Every generated test case MUST conform to this format.

### Step 1: Determine Input Source

| Argument | Source | Action |
|----------|--------|--------|
| `VCST-XXXX` | JIRA ticket | Fetch via Atlassian MCP → extract AC, scope, affected modules |
| `domain` | Domain name | Match to domain checklist (`/qa-checklist`) → derive cases from items |
| `suite NN` | Existing suite | Read `regression/suites/{Frontend\|Backend}/NN-*.csv` → identify gaps → generate new cases |
| `migrate NN` | Legacy suite | Read legacy CSV → transform each row to enriched format |
| `from-checklist domain` | Checklist | Read domain checklist → generate 1 case per item (add a second only if the item has a distinct boundary or negative dimension with a concrete bug hypothesis) |
| `from-bdd "Given..."` | BDD scenario | Parse Given/When/Then → map to Steps/Assertions/Preconditions |

### Step 1.5: Determine Target Layers

If `--layer` is specified, use it. Otherwise, auto-detect from the feature scope:

| Feature Signal | Layers to Generate |
|---------------|-------------------|
| New REST endpoint or module API | `api` + `admin` (if has UI) + `e2e` |
| New GraphQL query/mutation | `graphql` + `e2e` |
| Admin UI feature (CRUD, blade, grid) | `admin` + `api` (for data verification) |
| Storefront feature (cart, checkout, catalog) | storefront (base format) + `graphql` + `e2e` |
| Cross-cutting feature (coupons, pricing, orders) | **all layers** |
| Bug fix | layer where the bug was found + `e2e` regression |

**Layer resolution rules:**
1. Read JIRA ticket labels, component field, and affected modules
2. Check if the feature has REST endpoints → include `api` layer
3. Check if the feature has GraphQL operations → include `graphql` layer
4. Check if the feature has Admin UI → include `admin` layer
5. If the feature spans storefront + backend → include `e2e` layer
6. **Default for `--layer all`:** generate for every applicable layer

Each layer produces its own test case block with layer-appropriate tags from `test-case-template.md` (see "Layer-Specific Formats" section).

### Step 2: Gather Context

1. **Identify affected domain(s)** — map input to one or more of the 18 domains in `/qa-checklist`
2. **Load business rules** — read `business-logic.md`, find all `BL-*` invariants relevant to the domain
3. **Load edge cases** — read `e-commerce-edge-cases-library.md`, find all `ECL-*` patterns for the domain
4. **Check existing coverage** — read the target suite CSV (if it exists) to avoid duplicating existing test cases
5. **Get UI context** — read `agents/knowledge/sitemap.md` for page URLs, product types, navigation paths

### Step 2.5: GraphQL Schema Validation (Required for `--layer graphql` or GraphQL-related features)

**MANDATORY** when generating GraphQL test cases. Skipping this step produces invalid queries/mutations.

1. **Read schema reference** — read `agents/knowledge/graphql-schema.md` (introspected from live endpoint)
2. **Check schema freshness** — if the feature involves new/changed GraphQL operations, run `npm run schema:refresh` first to update the reference from live introspection
3. **Validate every query/mutation** in the test case against the schema:
   - **Query/mutation name exists** in the schema (e.g., there is NO `createCart` mutation)
   - **Argument names and types match** (e.g., `products` uses `query:`, not `keyword:`)
   - **All mutations use `command` wrapper**: `mutation { name(command: { ...fields }) { ...return } }`
   - **Input type fields match** — check `InputAddItemType`, `InputCreateOrganizationType`, etc. for valid field names (e.g., `InputCreateOrganizationType` has NO `storeId`)
   - **Response field names match return type** (e.g., CartType has flat `subTotal`, not `totals { subTotal }`)
   - **MoneyType uses `{ amount currency { code } }`**, not `{ amount currencyCode }`
   - **Facets use `term_facets { terms { ... } }`**, not `facets { values { ... } }`
   - **Required args (`!`) are always provided** (e.g., `pages` requires `keyword!`)
4. **If the schema reference is missing or stale**, introspect directly:
   ```bash
   curl -sk "{{BACK_URL}}/graphql" -H "Content-Type: application/json" \
     -d '{"query":"{ __type(name: \"TypeName\") { fields { name } inputFields { name } } }"}'
   ```

### Step 3: Derive Test Cases (Minimum Effective Set)

**Guiding principle — quality over quantity.** Every generated test case must have a clear **bug hypothesis**: a specific failure mode it is designed to catch. If you cannot answer "what real bug would this catch and why would it occur?", do not generate the case. Coverage numbers are vanity metrics — a suite of 10 targeted cases that each have a distinct failure hypothesis is more valuable than 50 shallow cases that repeat the same happy path with minor variations.

For each requirement/checklist item/BDD scenario:

1. **Identify the happy path** — generate **1** test case for the primary success flow. This is the baseline; do not generate variations of it.
2. **Apply test design techniques selectively** — only where there is a real risk of failure:
   - Boundary values: only for inputs where off-by-one or threshold errors are plausible in the implementation (e.g., quantity limits, price tier thresholds, discount caps)
   - Equivalence partitions: only when the system has genuinely distinct code paths per partition
   - State transitions: for lifecycle features (orders, quotes) where wrong-state transitions are a known failure mode
   - Error guessing: for known VC platform quirks (e.g., double-click submit, GraphQL HTTP 200 ≠ success)
3. **Add negative cases** — at minimum 1 per happy path: the most likely real-world failure (invalid input, expired token, missing required field, unauthorized role). Do not generate negative cases for every possible invalid input — pick the one most likely to slip through.
4. **Add edge cases** — only from `ECL-*` patterns with documented failure history for this domain. Do not add edge cases speculatively.
5. **Add cross-domain cases** — only when the interaction point between domains is a known source of bugs (e.g., cart + coupon discount stacking, checkout + inventory reservation race).
6. **Cull before finalizing** — review the full candidate list and remove any case that: (a) duplicates the failure hypothesis of another case, (b) tests infrastructure rather than logic, or (c) would only fail if the framework itself is broken.

### Step 3.5: VC-Specific State Patterns (check on every applicable feature)

When the feature contains any of the following field types, generate targeted cases for them. Each pattern has known failure modes in VC — these are not speculative.

#### On/Off Feature Flags & Active/Inactive Toggles

Appears in: store settings, promotions, coupons, catalog items, price lists, content pages, B2B org settings.

| State Scenario | Bug Hypothesis | Priority |
|---------------|---------------|---------|
| Item disabled → storefront must NOT show it or return it via API/GraphQL | Flag respected at display/query layer — common to forget filtering in one layer | P0 |
| Item disabled → API/GraphQL returns nothing, NOT a 5xx or empty data with errors | Disabled items often return 500 or malformed response instead of empty result | P0 |
| Toggle Off → save → reload page → still Off | Toggle state not persisted correctly to backend | P1 |
| Toggle On → Off → feature immediately unavailable | Cache invalidation on flag change — stale cache serves feature after deactivation | P1 |
| Inactive item in active category: category still visible, item filtered out | Cascade logic — parent active, child inactive, boundary filtering | P1 |

**Minimum cases:** 1 "disabled = not visible" case + 1 "state persists after save" case per toggle.

#### Start Date / End Date Fields

Appears in: promotions, coupons, price lists, content slots, scheduled imports.

| State Scenario | Bug Hypothesis | Priority |
|---------------|---------------|---------|
| Start date in future → entity NOT active yet (storefront/API must not apply it) | Date comparison uses server time vs client time; off-by-timezone errors | P0 |
| Start date past, end date future → entity IS active | The normal valid state — confirm it works, used as baseline | P0 |
| End date in past → entity expired → no longer applied | Expiry check at query time vs cached at creation time | P0 |
| Start date = today (boundary) → entity active from today | Boundary: inclusive vs exclusive comparison (>= vs >) | P1 |
| End date = today → entity still active today or already expired? | Boundary: end of day vs start of day; timezone offset issues | P1 |
| Start date after end date → validation error, entity not saved | Input validation — should reject before persistence, not silently swap values | P1 |
| No end date (open-ended) → entity active indefinitely | Null end date should not be treated as "expired at epoch" | P1 |
| Date range valid but entity also has active=false flag → inactive wins | Flag + date range interaction: both conditions must hold | P1 |

**Minimum cases:** expired case + future start case + boundary (today) case. Skip the no-end-date case only if the UI does not expose that option.

#### State Transitions (lifecycle objects)

Applies to: orders, quotes, RFQs, returns, import/export jobs.

Generate cases only for transitions that have business consequences:
- Valid transition: state A → state B → expected behavior/data change
- Invalid transition: state A → state C (should be rejected, not silently ignored)
- Side effects: does the transition trigger notifications, webhooks, index updates?

Do NOT generate a case for every possible transition — only those where rejection of an invalid transition or a missed side effect would be a real bug.

---

### Step 4: Write Each Test Case

For every test case, populate all 15 columns following the template:

```
ID, Title, Section, Priority, Business_Rule, Edge_Case_Refs, Preconditions, Test_Data, Steps, Assertions, Cross_Layer_Checks, Failure_Signals, Cleanup, References, Automation_Status
```

**Column-by-column checklist:**

- [ ] **ID** — `PREFIX-NNN` format, sequential, never reuse. Prefix matches suite (e.g., `SMK`, `CART`, `PAY`, `AUTH`, `API`)
- [ ] **Title** — `[Subject] — [Action/Scenario]` pattern, short and action-oriented
- [ ] **Section** — `Suite > Domain > Sub-area` hierarchy
- [ ] **Priority** — Critical/High/Medium/Low based on risk and business impact
- [ ] **Business_Rule** — At least one `BL-*` ID (leave blank only for pure UI tests)
- [ ] **Edge_Case_Refs** — `ECL-*` IDs if the case covers a known edge case pattern
- [ ] **Preconditions** — Human-readable state requirements, use `{{VAR}}` for env values
- [ ] **Test_Data** — Only `key={{VAR}}` bindings, comma-separated
- [ ] **Steps** — Every step tagged: `[NAV]`, `[ACT]`, `[WAIT]`, `[SCROLL]`, `[KEY]`. One action per line. WAIT after every state-changing ACT
- [ ] **Assertions** — Tagged: `[DOM]`, `[STATE]`, `[MATH]`, `[FORMAT]`, `[NAV]`. Explicit predicates, no vague language
- [ ] **Cross_Layer_Checks** — Tagged: `[API]`, `[CONSOLE]`, `[NETWORK]`, `[ADMIN]`, `[EMAIL]`. Every mutation MUST check `errors[]` is empty
- [ ] **Failure_Signals** — At least 2: one timeout signal + one API/console signal
- [ ] **Cleanup** — State restoration or `none`
- [ ] **References** — JIRA ticket IDs, related BL-* IDs
- [ ] **Automation_Status** — `Automated` (default for MCP-executable cases)

### Step 5: Validate & Output

1. **Self-review each case** against the writing guidelines in `test-case-template.md`:
   - No assertions mixed into Steps
   - No hardcoded URLs/emails/passwords (all `{{VAR}}`)
   - Every mutation has `errors[]` check in Cross_Layer_Checks
   - At least 2 failure signals per case
   - **Layer-correct tags**: API cases use `[HTTP]`/`[STATUS]`/`[BODY]`, not `[NAV]`/`[ACT]`
   - **GraphQL cases** always include `[ERRORS] errors[] is empty` assertion
   - **GraphQL cases** validated against `graphql-schema.md`: query/mutation names, arg names, command wrapper, response field names, MoneyType structure (Step 2.5 checklist)
   - **Admin cases** use `[BLADE]`/`[GRID]`/`[SAVE]` tags, not generic `[ACT]` for blade interactions
   - **E2E cases** have `--- LAYER ---` markers and assertions from ≥2 layers
2. **Check for duplicates** against existing suite cases
3. **Output format** — present as a **Feature Test Matrix** grouped by layer:

```
## Feature Test Matrix: [Feature Name] (VCST-XXXX)

### Layer: REST API (N cases → Suite 14)
| ID | Title | Priority | Business Rules | Technique |
[CSV block for API cases]

### Layer: GraphQL xAPI (N cases → Suite 15)
| ID | Title | Priority | Business Rules | Technique |
[CSV block for GraphQL cases]

### Layer: Admin UI (N cases → Suite NN)
| ID | Title | Priority | Business Rules | Technique |
[CSV block for Admin cases]

### Layer: E2E Cross-Layer (N cases → Suite 00/NN)
| ID | Title | Priority | Business Rules | Technique |
[CSV block for E2E cases]

### Coverage Summary
| Layer | P0 | P1 | P2 | Total | BL-* Coverage |
| Traceability: VCST-XXXX → [all generated case IDs]
```

4. **Suggest placement** — which suite file each layer's cases should be added to
5. **Cross-layer traceability** — every case in every layer links back to the same feature (VCST-XXXX in References column). The Feature Test Matrix header connects them all.

## Modes

### Generate Mode (default)
Produce new test cases and present them for review. Do not modify suite files without explicit confirmation.

### Migrate Mode (`migrate NN`)
Transform legacy TestRail-format CSV rows to the enriched format:
1. Read the existing suite CSV
2. For each row, apply the migration mapping from `test-case-template.md` (Migration section)
3. Split `Steps` → `Steps` + `Assertions`
4. Split `Expected Result` → `Assertions` + `Cross_Layer_Checks`
5. Split `Preconditions` → `Preconditions` + `Test_Data`
6. Add new columns: `Business_Rule`, `Edge_Case_Refs`, `Failure_Signals`, `Cleanup`
7. Remove: `Type`, `Estimate`
8. Present the migrated CSV for review

### Extend Mode (`suite NN`)
Read existing suite, analyze gaps, generate cases to fill them:
1. Read the current suite CSV and count cases per section
2. Cross-reference with the domain checklist(s) for that suite
3. Identify uncovered checklist items or missing edge cases
4. Generate new cases only for the gaps
5. Use the next available ID in the suite's numbering sequence

## Output Example

```csv
PAY-042,"CyberSource — Expired Card Rejection","Payment > CyberSource > Validation",High,BL-PAY-001,"ECL-1.1, ECL-1.3","User logged in, cart has items, CyberSource payment selected on cart page","email={{USER_EMAIL}}, password={{USER_PASSWORD}}, front_url={{FRONT_URL}}","[NAV] {{FRONT_URL}}/cart
[WAIT] cart loaded with items
[WAIT] CyberSource payment form iframe visible
[ACT] fill card number: 4111111111111111
[ACT] fill expiry: 01/23
[ACT] fill CVV: 123
[ACT] click 'Place Order'
[WAIT] form validation response","[DOM] error message displayed indicating expired card
[DOM] 'Place Order' button re-enabled after error
[STATE] order NOT created — cart still intact","[API] payment authorization returns decline code
[CONSOLE] no unhandled JS errors
[NETWORK] no 5xx responses from payment gateway","Payment spinner visible >10s, 5xx from payment endpoint, console TypeError, blank payment form","none — order was not placed",VCST-4648,Automated
```

## Layer → Agent Delegation

Generated test cases route to the correct executing agent by layer:

| Layer | Execute With | Browser | Suite Target |
|-------|-------------|---------|-------------|
| REST API | `qa-backend-expert` | `playwright-edge` or Postman MCP | Suite 14 (`Backend/14-*.csv`) |
| GraphQL xAPI | `qa-backend-expert` | `playwright-edge` or Postman MCP | Suite 15 (`Backend/15-*.csv`) |
| Admin UI | `qa-backend-expert` | `playwright-edge` or Chrome DevTools | Suite 16-34 (by module) |
| Storefront UI | `qa-frontend-expert` | `playwright-chrome` | Suite 01-13 (by area) |
| E2E Cross-Layer | `qa-frontend-expert` + `qa-backend-expert` | coordinated | Suite 00 or feature suite |
| Storybook/A11y | `ui-ux-expert` | Chrome DevTools | Separate |

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `/qa-checklist` | Checklists are input — each item becomes 1-3 test cases |
| `/qa-test-design` | Techniques (EP, BVA, decision tables) drive case derivation |
| `/qa-risk` | Risk level determines priority assignment and case count |
| `/qa-coverage-gap` | Gap analysis identifies where new cases are needed most |
| `/qa-plan` | Generated cases feed into test plans |
| `agents/knowledge/sitemap.md` | Sitemap provides URLs and navigation context for steps |
| `/qa-api ref` | xAPI reference for Cross_Layer_Checks assertions |

## Rules

- **Bug hypothesis first** — every case must answer: "what real bug does this catch?" If you cannot answer, do not generate the case. Coverage numbers are vanity metrics.
- **Minimum effective set** — a smaller suite of targeted cases is better than a large suite of shallow ones. Prefer 5 focused cases over 20 that repeat the same failure mode.
- **Format is non-negotiable** — every case MUST use all 15 columns from `test-case-template.md`
- **No vague assertions** — "page loads correctly" is not an assertion. Use `[DOM] product title visible` or `[NAV] URL matches /product/*`
- **No compound steps** — one action per `[ACT]` line. Wrong: `click Add to Cart and verify badge`. Right: separate `[ACT]` and `[ASSERT]`
- **Always `{{VAR}}`** — never hardcode URLs, credentials, or SKUs in steps
- **Every mutation → `errors[]` check** — GraphQL HTTP 200 does not mean success in xAPI
- **Minimum 2 failure signals** per case (timeout + API/console)
- **Negative cases are mandatory** — for every happy path, generate at least one negative/error case — pick the failure mode most likely to slip through, not all possible invalid inputs
- **ID stability** — never reuse or renumber IDs. Deleted cases leave gaps in numbering
- **Ask before writing** — present generated cases for review before appending to any suite CSV file
