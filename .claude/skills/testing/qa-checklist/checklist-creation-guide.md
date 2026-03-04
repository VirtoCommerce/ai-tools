# Checklist Creation Guide

> Reference file for the `/qa-checklist` skill. Read when creating new domain checklists.

## What Is a Test Case Writing Checklist?

A checklist is a **compact, domain-scoped list of verification points** that ensures no critical test case is forgotten when writing tests for a feature area. Each item should map to at least one concrete test case.

Checklists are NOT test cases themselves — they are the **blueprint** from which test cases are derived.

```
Checklist Item                          → Test Cases
─────────────────────────────────────── → ─────────────────────────
"Stepper +/- buttons: increment,        → TC-001: Click + to increment qty
 decrement, boundary enforcement"        → TC-002: Click - to decrement qty
                                         → TC-003: Click - at min qty (boundary)
                                         → TC-004: Click + at max stock (boundary)
```

## Checklist Structure Rules

### Item Format
Each item follows this pattern:
```
- [ ] [UI Element / Action]: [specific behaviors to verify]
```

Examples:
- `- [ ] Stepper +/- buttons: increment, decrement, boundary enforcement`
- `- [ ] Skyflow Visa: card entry → tokenization → payment success → order status "Paid"`
- `- [ ] Out-of-stock variant: greyed/disabled, "Out of Stock" message, cannot add`

### Sizing Rules
| Domain Complexity | Item Count | Examples |
|-------------------|------------|----------|
| Narrow (single component) | 6-8 | Ship-to Selector, Google Analytics |
| Medium (feature area) | 8-11 | Auth, Search, Orders |
| Broad (multi-step flow) | 11-15 | Cart/Checkout, Product Configs & Variations |

### Mandatory Sections

Every checklist for a P0/P1 domain must include:

1. **Happy path items** — The core user journey steps
2. **Validation/error items** — Invalid inputs, empty states, boundaries
3. **Cross-layer verification** — Storefront → API → Admin round-trip
4. **Edge cases** — Browser refresh mid-flow, back button, concurrent actions

## Creating a New Checklist — Step by Step

### Step 1: Scope the Domain

Define boundaries clearly:
- What pages / URLs does this domain cover?
- What user roles interact with it? (guest, buyer, admin, org admin)
- What data entities does it create or modify?
- What other domains does it touch? (list as "Related checklists")

### Step 2: Explore the UI (Mandatory)

Navigate to the feature in the live environment using Playwright:

1. **Identify all interactive elements** — buttons, links, inputs, dropdowns, toggles, tabs
2. **Note real UI labels** — use the exact text shown (e.g., "Add to Cart" not "Submit")
3. **Walk the happy path** — record each step with actual UI behavior
4. **Try error states** — empty fields, invalid data, missing preconditions
5. **Try boundary values** — min/max quantities, character limits, edge dates
6. **Check console + network** — note any errors or failed API calls
7. **Test responsiveness** — if applicable, check mobile/tablet viewpoints

### Step 3: Map Interactions to Checklist Items

For each interaction discovered, ask:
- Does this need its own checklist item? (If it's a distinct verification point → yes)
- Can it be grouped with related interactions? (e.g., "Stepper +/- buttons: increment, decrement, boundary enforcement" groups 3 related checks)
- Is there a negative/error path? (add as separate item if significant)

### Step 4: Add Cross-Layer Verification

For every domain that modifies data, add items that verify the change propagated:

| Action Layer | Verification Layers |
|-------------|-------------------|
| Storefront action | API response confirms, Admin shows change |
| Admin action | Storefront reflects (after search index lag if catalog), API returns updated data |
| API mutation | Storefront UI updates, Admin blade shows result |

### Step 5: Add VC-Specific Patterns

Apply these Virto Commerce patterns where relevant:

| Pattern | Checklist Item Template |
|---------|----------------------|
| Search index lag | `- [ ] After [change], verify storefront reflects update (30-60s reindex delay)` |
| Multi-store context | `- [ ] Verify behavior scoped to active store (STORE_ID)` |
| Multi-language | `- [ ] Verify labels/content in non-English locale (if localized)` |
| Multi-currency | `- [ ] Verify prices display in selected currency` |
| B2B vs B2C | `- [ ] Verify B2B-specific features (org context, approval workflows)` |
| Theme (Coffee) | `- [ ] Verify styling matches Coffee theme (Light/Dark/Auto)` |
| xAPI context | `- [ ] Verify xAPI calls include storeId, cultureName, currencyCode` |

### Step 6: Validate and Refine

- [ ] Every item is specific enough to derive ≥1 test case
- [ ] No duplicate coverage between items
- [ ] Real UI labels used (validated by exploration)
- [ ] Item count within 6-15 range
- [ ] Cross-layer verification included for data-modifying domains
- [ ] Edge cases and error paths represented
- [ ] Related checklists identified

## Quality Criteria for Checklist Items

### Good Items
- `- [ ] Variation swatches: color, size selectors displayed on PDP` — specific element + location
- `- [ ] Declined card: error message, retry with different card, success` — complete scenario chain
- `- [ ] Cart isolation: Org A cart ≠ Org B cart, switching preserves each` — verifiable assertion

### Bad Items
- `- [ ] Test the product page` — too vague, no specific checks
- `- [ ] Verify everything works` — not actionable
- `- [ ] Check the API` — no specific endpoint, method, or data to verify
- `- [ ] Styling looks correct` — no acceptance criteria

### Item Granularity Guide

**Too coarse (split it):**
> `- [ ] Complete checkout flow with payment`

Split into:
> `- [ ] Shipping address selection and validation`
> `- [ ] Shipping method selection (rates, delivery estimate)`
> `- [ ] Payment method entry and processing`
> `- [ ] Order confirmation page with order number`

**Too fine (merge it):**
> `- [ ] Click + button on qty stepper`
> `- [ ] Verify qty increments by 1`
> `- [ ] Verify line total recalculates`

Merge into:
> `- [ ] Stepper +/- buttons: increment, decrement, boundary enforcement`

## Combining Checklists for Multi-Domain Features

When a feature spans multiple domains (common for JIRA tickets):

1. Identify all affected domains
2. Pull relevant items from each domain's checklist
3. Remove duplicates (e.g., "Place order" appears in both Cart/Checkout and Payment)
4. Add a **cross-domain integration** section for items that verify the seams between domains
5. Prefix each item with its domain tag for traceability

Example for "Configurable product checkout" (spans: #5 Add to Cart, #8 Cart/Checkout, #9 Payment, #13 Configs):
```markdown
### Combined Checklist: Configurable Product Checkout

**[CONFIG]**
- [ ] Configurable product: "Customize" CTA → sections → running total
- [ ] Configured product in cart: shows selected options, edit reopens configurator

**[ADD-TO-CART]**
- [ ] Configurable products: "Customize" → configure sections → add
- [ ] Cart icon badge count updates immediately

**[CART/CHECKOUT]**
- [ ] Order summary: items, subtotal, shipping, tax, total
- [ ] Place order → confirmation page → order number → cart cleared

**[PAYMENT]**
- [ ] Skyflow Visa: card entry → tokenization → payment success

**[CROSS-DOMAIN]**
- [ ] Configured options display correctly through entire flow: PDP → cart → checkout → order confirmation → admin order
- [ ] Price calculated from configuration persists through checkout (no price change on place order)
```

## E2E Scenario Catalog Mapping

When creating a new checklist, cross-reference with the E2E scenario catalog (`.claude/skills/testing/qa-plan/e2e-scenario-catalog.md`) to ensure coverage alignment:

| Catalog Domain | Checklist Domain(s) |
|---------------|-------------------|
| E2E-AUTH | #1 Auth |
| E2E-CAT | #2 Catalog, #3 Categories |
| E2E-SEARCH | #6 Search |
| E2E-CART | #5 Add to Cart, #8 Cart/Checkout |
| E2E-CHK | #8 Cart/Checkout |
| E2E-PAY | #9 Payment |
| E2E-ORD | #10 Orders |
| E2E-BOPIS | #15 BOPIS (Pickup) |
| E2E-ORG | #12 Multi-Org |
| E2E-MEMBER | #11 Company Members |
| E2E-CONFIG | #13 Product Configs & Variations |
| E2E-GA | #14 Google Analytics |
| E2E-QUOTE | #16 B2B Quotes & RFQ |
| E2E-LIST | #17 B2B Lists & Quick Order |
| E2E-L10N | #18 Localization & i18n |
| E2E-SEC | (security — no dedicated checklist yet, create with `new`) |

## Template for New Checklist

```markdown
#### N. [Domain Name]
- [ ] [Happy path item 1]
- [ ] [Happy path item 2]
- [ ] [Validation / error item]
- [ ] [Boundary / edge case item]
- [ ] [Cross-layer verification item]
- [ ] [State transition item (if applicable)]
- [ ] [B2B-specific item (if applicable)]
- [ ] [Mobile / responsive item (if applicable)]
```
