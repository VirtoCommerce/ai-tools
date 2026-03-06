---
description: "[Testing] Generate test case writing checklists for any domain, feature, or regression area. Uses 18 built-in domain checklists + custom creation."
argument-hint: "domain name | feature | VCST-XXXX | new <domain>"

---

# /qa-checklist — Test Case Writing Checklist Creation

Generate or retrieve domain-specific checklists that ensure complete test case coverage. Each checklist item maps to at least one test case.

## Usage
```
/qa-checklist auth                     # Retrieve Auth domain checklist
/qa-checklist "product configurations" # Retrieve Product Configs & Variations checklist
/qa-checklist VCST-1234                # Generate checklist for JIRA ticket scope
/qa-checklist new "push messages"      # Create new checklist for unlisted domain
/qa-checklist all                      # List all 18 domain checklists with item counts
```

## Supporting Files

- **domain-checklists.md** — All 18 domain checklists with 148 items (the source of truth).
- **checklist-creation-guide.md** — Methodology for creating new checklists: structure rules, quality criteria, VC-specific patterns, cross-layer verification, and examples.

## 18 Built-in Domain Checklists

Reference: `.claude/skills/testing/qa-checklist/domain-checklists.md`

| # | Domain | Items | Key Focus |
|---|--------|-------|-----------|
| 1 | Auth | 8 | Registration, sign-in, password reset, sessions, lockout |
| 2 | Catalog | 8 | Navigation, facets, sorting, PDP, filtering, SEO URLs |
| 3 | Categories | 6 | Multi-level nav, breadcrumbs, pagination, empty state |
| 4 | SEO | 7 | Friendly URLs, canonical, meta, structured data, 404 |
| 5 | Add to Cart | 9 | Stepper, qty limits, pack size, variations B2B/B2C, configurable |
| 6 | Search | 8 | Autocomplete, global/category, history, fuzzy, no results |
| 7 | Ship-to Selector | 6 | Favorite, add new, show more, search, format |
| 8 | Cart/Checkout | 11 | Qty changes, save for later, pickup, shipping, payment, promo |
| 9 | Payment | 8 | Skyflow, CyberSource, AuthorizeNet, DataTrance OTP, PCI |
| 10 | Orders | 7 | Detail, history, filters, reorder, status lifecycle |
| 11 | Company Members | 7 | Invite, roles, block/unblock, delegated purchasing |
| 12 | Multi-Org | 7 | Switcher, cart isolation, ship-to, pricing, shared lists |
| 13 | Product Configs & Variations | 14 | Swatches, price update, out-of-stock, configurator, B2B/B2C |
| 14 | Google Analytics | 6 | dataLayer events, checkout funnel, search, GA4 network |
| 15 | BOPIS (Pickup) | 7 | Location selector, map, mixed cart, change location |
| 16 | B2B Quotes & RFQ | 8 | Create RFQ, negotiation, accept/reject, expiry |
| 17 | B2B Lists & Quick Order | 7 | Create list, shared/private, quick order, bulk order |
| 18 | Localization & i18n | 7 | Language switch, multi-currency, 14 locales, RTL |
| BF | Bug Fix Verification | 10 | Fix confirmation, regression scope, cross-layer, edge cases |

**Total: 158 checklist items across 18 domains + 1 cross-domain checklist.**

## Execution

### Mode 1: Retrieve Existing Checklist

1. Match the user's argument to one of the 18 domains (fuzzy match: "payment" → #9, "cart" → #8, "variations" → #13, "pickup" → #15)
2. Read the checklist from `domain-checklists.md`
3. Present the checklist with markdown checkboxes
4. Suggest related checklists (e.g., "Cart/Checkout" often pairs with "Payment" and "Orders")

### Mode 2: Generate Checklist for JIRA Ticket

1. Fetch JIRA ticket via Atlassian MCP — extract feature scope, acceptance criteria
2. Map the ticket to affected domains (a ticket may touch 2-4 domains)
3. Merge relevant checklist items from each domain into a combined checklist
4. Add ticket-specific items derived from acceptance criteria not covered by existing checklists
5. Output a single unified checklist with domain section headers

### Mode 3: Create New Checklist (`new` keyword)

1. Read `checklist-creation-guide.md` for methodology
2. Identify the domain scope from the user's argument
3. **Explore the UI** (mandatory) — navigate to the feature in the storefront or admin using Playwright to discover real labels, interactions, states
4. Apply the checklist creation methodology:
   - Map all user-visible interactions (inputs, buttons, selectors, navigation)
   - Identify state transitions and business rules
   - Add cross-layer verification items (storefront → API → admin)
   - Add error/edge case items
   - Add boundary value items
5. Structure with markdown checkboxes, 6-15 items per domain
6. **Propose adding** the new checklist to `domain-checklists.md` (ask user for confirmation)

### Mode 4: List All (`all` keyword)

1. Read `domain-checklists.md`
2. Present summary table with domain names, item counts, and key focus areas
3. Highlight which domains are most relevant to current sprint work (if context available)

## Output Format

```markdown
### [Domain Name] — Test Case Writing Checklist

> X items | Related suites: XX, XX | Priority: P0/P1

- [ ] Item description (specific, actionable, uses real UI labels)
- [ ] Item description
- ...

**Cross-layer checks:**
- [ ] Storefront UI reflects expected state
- [ ] No console errors or failed network requests
- [ ] Admin confirms data persisted correctly

**Related checklists:** [Domain A], [Domain B]
```

## Rules

- Every checklist item must be specific enough to derive at least one test case from it
- Use REAL UI labels discovered from exploration (not generic terms)
- Keep items actionable — start with a verb or UI element name
- 6-15 items per domain (fewer = incomplete, more = too granular)
- Always include cross-layer verification items for P0/P1 domains
- New checklists must be validated against the live environment before delivery
- Link back to E2E scenario catalog (`e2e-scenario-catalog.md`) for related scenarios

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `/qa-plan` | Checklists feed into test plan creation — ensures no domain is missed |
| `/qa-test-design` | Checklist items can be expanded using EP, BVA, decision tables |
| `/qa-risk` | High-risk domains get more granular checklist items |
| `/qa-sbtm` | Checklists serve as starting point for exploratory session charters |
| `/vc-frontend` | Sitemap provides URLs and product types for UI exploration |
