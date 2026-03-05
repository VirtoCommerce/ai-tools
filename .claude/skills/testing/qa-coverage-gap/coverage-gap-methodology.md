# Coverage Gap Methodology

## Gap Detection Heuristics

### 1. Feature Inventory Comparison
Compare the complete feature inventory (from sitemap, API reference, business logic, domain checklists) against existing test case titles and sections. A gap exists when:
- A user-facing page has zero test cases targeting it
- An API endpoint has zero test cases exercising it
- A business invariant has no test case verifying it
- A user flow from the E2E scenario catalog has no corresponding regression test

### 2. Coverage Depth Assessment
Even when test cases exist, assess depth:
- **Shallow coverage**: Only happy path tested, no error/edge cases
- **Missing negative tests**: No invalid input, boundary, or error path tests
- **Missing integration tests**: Feature tested in isolation but not end-to-end
- **Missing cross-domain tests**: Feature works alone but not verified after related feature changes

### 3. Priority Scoring Matrix

| Factor | Weight | Scoring |
|--------|--------|---------|
| Revenue impact | 40% | P0=10, P1=6, P2=3 |
| User frequency | 25% | Daily=10, Weekly=6, Monthly=3, Rare=1 |
| Failure severity | 20% | Data loss=10, Functional=7, UX=4, Cosmetic=1 |
| Existing coverage | 15% | Zero=10, 1-2 cases=7, 3-5=4, 6+=1 |

**Priority assignment:**
- Score 8.0-10.0 → P0 (Critical) — must fix immediately
- Score 5.0-7.9 → P1 (High) — fix this sprint
- Score 2.0-4.9 → P2 (Medium) — plan for next sprint
- Score < 2.0 → P3 (Low) — backlog

### 4. Gap Categories

| Category | Description | Example |
|----------|-------------|---------|
| `ZERO_COVERAGE` | Feature exists with absolutely no tests | Bulk Order page has no test cases |
| `SHALLOW_HAPPY` | Only happy path, no errors/edges | Cart add tested, but not "add out-of-stock" |
| `MISSING_NEGATIVE` | No negative/error test cases | Payment form tested with valid card, not invalid |
| `MISSING_INTEGRATION` | Feature works alone, not tested in flow | Search tested, but not "search → add to cart → checkout" |
| `MISSING_CROSS_DOMAIN` | No cascade verification | Admin price change not verified on storefront |
| `STALE_COVERAGE` | Tests exist but may be outdated | Test references removed UI element |

## Test Case Generation Rules

### ID Assignment
- Use domain prefix + sequential number: `{DOMAIN}-{NNN}`
- Start numbering after the highest existing ID in that domain
- Examples: `QUOTE-001`, `BULK-001`, `DASH-001`

### Quality Checklist
Each generated test case MUST have:
- [ ] Unique ID following domain prefix pattern
- [ ] Descriptive title (verb + object + condition)
- [ ] Section matching domain classification
- [ ] Type: "Functional" (default), "Negative", "Integration", "Security", "Performance"
- [ ] Priority: Critical, High, Medium (matching P0/P1/P2)
- [ ] Estimate in "Xm" format (e.g., "5m", "10m", "15m")
- [ ] Preconditions (user state, data requirements, env requirements)
- [ ] Numbered steps (1., 2., 3.) with explicit actions
- [ ] Expected results per step or per group of steps
- [ ] References (VCST ticket if applicable, or "Coverage Gap Analysis")
- [ ] Automation Status: "generated" (initial), "validated" (after Cycle 3), "needs-review" (if validation failed)

### Step Writing Rules
- Use imperative verbs: "Navigate to", "Click", "Enter", "Verify", "Wait for"
- Reference elements by visible text or semantic role, not CSS selectors
- Include wait conditions: "Wait for page to load", "Wait for modal to appear"
- Specify test data: actual values, not "enter a valid email"
- For environment-dependent URLs: use `{FRONT_URL}`, `{BACK_URL}` placeholders

## Validation Protocol

### Browser Validation (Cycle 3)
1. Open browser via `playwright-chrome`
2. Navigate to starting URL
3. Execute each step literally
4. At each "Verify" step, check the assertion
5. If step fails:
   - Screenshot the failure state
   - Determine if it's a test case defect or an app bug
   - If test case defect: revise steps and re-run
   - If app bug: mark test as `validated` but file a bug report
6. Record validation result in CSV `Automation Status` column

### Validation Priorities
- P0 test cases: MUST validate all
- P1 test cases: validate at least the happy path case per domain
- P2 test cases: skip validation (review only)
