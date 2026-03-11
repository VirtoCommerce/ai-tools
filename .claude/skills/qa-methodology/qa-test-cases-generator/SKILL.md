---
description: "[QA Method] Generate agent-native test cases in enriched CSV format from JIRA tickets, features, checklists, or existing suites. Uses business logic invariants and edge case library."
argument-hint: "VCST-XXXX | domain | suite ID | migrate <suite> | from-checklist <domain>"
---

# /qa-test-cases-generator — Agent-Native Test Case Generation

Generate structured test cases in the enriched CSV format defined by `test-case-template.md`. Produces test cases that AI agents can execute directly via MCP browser tools — with typed steps, explicit assertions, cross-layer checks, and failure signals.

## Usage
```
/qa-test-cases-generator VCST-4565              # Generate from JIRA ticket
/qa-test-cases-generator cart                    # Generate for a domain
/qa-test-cases-generator suite 06               # Extend existing suite with new cases
/qa-test-cases-generator migrate 04             # Migrate legacy suite to enriched format
/qa-test-cases-generator from-checklist payment  # Generate from domain checklist items
/qa-test-cases-generator from-bdd "Given user has items in cart, When they apply coupon..."
```

## Supporting Files

- **test-case-template.md** — Enriched CSV column spec with step type tags, assertion predicates, cross-layer checks, failure signals. **Read this first — it is the format contract.**

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
| `from-checklist domain` | Checklist | Read domain checklist → generate 1-3 test cases per checklist item |
| `from-bdd "Given..."` | BDD scenario | Parse Given/When/Then → map to Steps/Assertions/Preconditions |

### Step 2: Gather Context

1. **Identify affected domain(s)** — map input to one or more of the 18 domains in `/qa-checklist`
2. **Load business rules** — read `business-logic.md`, find all `BL-*` invariants relevant to the domain
3. **Load edge cases** — read `e-commerce-edge-cases-library.md`, find all `ECL-*` patterns for the domain
4. **Check existing coverage** — read the target suite CSV (if it exists) to avoid duplicating existing test cases
5. **Get UI context** — use `/vc-frontend` sitemap for page URLs, product types, navigation paths

### Step 3: Derive Test Cases

For each requirement/checklist item/BDD scenario:

1. **Identify the happy path** — generate 1 test case for the primary success flow
2. **Apply test design techniques** (from `/qa-test-design`):
   - Boundary values for numeric inputs (quantity, price thresholds)
   - Equivalence partitions for dropdown/selection inputs
   - State transitions for lifecycle features (orders, quotes)
   - Error guessing for known platform quirks
3. **Add negative cases** — invalid inputs, unauthorized access, empty states, timeout scenarios
4. **Add edge cases** — map relevant `ECL-*` patterns to concrete test scenarios
5. **Add cross-domain cases** — if the feature touches multiple domains (e.g., cart + payment), generate cases for the interaction points

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
2. **Check for duplicates** against existing suite cases
3. **Output format** — present as:
   - CSV block (ready to append to suite file)
   - Summary table: ID | Title | Priority | Business Rules | Technique Applied
4. **Suggest placement** — which suite file the cases should be added to

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

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `/qa-checklist` | Checklists are input — each item becomes 1-3 test cases |
| `/qa-test-design` | Techniques (EP, BVA, decision tables) drive case derivation |
| `/qa-risk` | Risk level determines priority assignment and case count |
| `/qa-coverage-gap` | Gap analysis identifies where new cases are needed most |
| `/qa-plan` | Generated cases feed into test plans |
| `/vc-frontend` | Sitemap provides URLs and navigation context for steps |
| `/vc-api` | xAPI reference for Cross_Layer_Checks assertions |

## Rules

- **Format is non-negotiable** — every case MUST use all 15 columns from `test-case-template.md`
- **No vague assertions** — "page loads correctly" is not an assertion. Use `[DOM] product title visible` or `[NAV] URL matches /product/*`
- **No compound steps** — one action per `[ACT]` line. Wrong: `click Add to Cart and verify badge`. Right: separate `[ACT]` and `[ASSERT]`
- **Always `{{VAR}}`** — never hardcode URLs, credentials, or SKUs in steps
- **Every mutation → `errors[]` check** — GraphQL HTTP 200 does not mean success in xAPI
- **Minimum 2 failure signals** per case (timeout + API/console)
- **Negative cases are mandatory** — for every happy path, generate at least one negative/error case
- **ID stability** — never reuse or renumber IDs. Deleted cases leave gaps in numbering
- **Ask before writing** — present generated cases for review before appending to any suite CSV file
