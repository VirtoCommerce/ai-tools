---
description: "[Testing] Generate test case writing checklists for any domain, feature, or regression area. Uses 23 built-in domain checklists + custom creation."
argument-hint: "domain name | feature | VCST-XXXX | new <domain>"

---

# /qa-checklist — Test Case Writing Checklist Creation

Generate or retrieve domain-specific checklists that ensure complete test case coverage. Each checklist item maps to at least one test case.

## Usage
```
/qa-checklist auth                     # Retrieve Auth domain checklist
/qa-checklist "product configurations" # Retrieve Product Configs & Variations checklist
/qa-checklist graphql                  # Retrieve GraphQL xAPI checklist (separate file)
/qa-checklist VCST-1234                # Generate checklist for JIRA ticket scope
/qa-checklist new "push messages"      # Create new checklist for unlisted domain
/qa-checklist all                      # List all 23 domain checklists with item counts
```

## Supporting Files

- **domain-checklists.md** — 22 storefront/admin domain checklists with 245 items (the source of truth for UI domains).
- **graphql-checklist.md** — GraphQL xAPI checklist with 34 items covering all xAPI modules (xCatalog, xCart, xOrder, xProfile, xCMS, xFrontend, xQuote) + per-change verification template.
- **checklist-creation-guide.md** — Methodology for creating new checklists: structure rules, quality criteria, VC-specific patterns, cross-layer verification, and examples.

## 23 Built-in Domain Checklists

### Storefront & Admin Domains (22) — `domain-checklists.md`

| # | Domain | Items | E2E Catalog | Related Suites |
|---|--------|-------|-------------|----------------|
| 1 | Auth | 8 | E2E-AUTH | 01, 02, 08 |
| 2 | Catalog | 12 | E2E-CAT | 01, 03, 16 |
| 3 | Categories | 6 | E2E-CAT | 03, 16 |
| 4 | SEO | 7 | E2E-CAT | 31 |
| 5 | Add to Cart | 10 | E2E-CART | 01, 04a |
| 6 | Search | 12 | E2E-SEARCH | 03, 26 |
| 7 | Ship-to Selector | 6 | E2E-CHK | 04a, 04b |
| 8 | Cart/Checkout | 15 | E2E-CHK | 04a, 04b, 06 |
| 9 | Payment | 12 | E2E-PAY | 06 |
| 10 | Orders | 7 | E2E-ORD | 01, 04c, 20 |
| 11 | Company Members | 14 | E2E-MEMBER | 02, 21 |
| 12 | Multi-Org | 11 | E2E-ORG | 02, 21 |
| 13 | Product Configurations & Variations | 14 | E2E-CONFIG | 36 |
| 14 | Google Analytics | 11 | E2E-GA | 07 |
| 15 | BOPIS (Pickup) | 12 | E2E-BOPIS | 05, 30 |
| 16 | B2B Quotes & RFQ | 13 | E2E-QUOTE | 04c, 20 |
| 17 | B2B Lists & Quick Order | 12 | E2E-LIST | 13 |
| 18 | Localization & i18n | 7 | E2E-L10N | 10 |
| 19 | Notifications | 12 | E2E-NOTIF | 24 |
| 20 | White Labeling | 13 | E2E-WL | 32, 35 |
| 21 | Account Management | 12 | E2E-ACCT | 01, 02, 13 |
| 22 | Storefront Push Messages | 8 | E2E-PUSH | 33 |
| **BF** | **Bug Fix Verification** | **10** | *cross-domain* | *per bug* |

### GraphQL xAPI (1) — `graphql-checklist.md`

| # | Domain | Items | E2E Catalog | Related Suites |
|---|--------|-------|-------------|----------------|
| 23 | GraphQL Queries & Mutations | 34 | E2E-GQL | 15 |

Sections: xCatalog (4), xCart Lifecycle (9), xCart Configurable (2), xCart Wishlists & Saved (2), xOrder (2), xProfile (6), xQuote (2), xCMS & xFrontend (2), Cross-Cutting (3), New Query/Mutation Verification (8).

**Total: 279 checklist items across 23 domains + 1 cross-domain checklist.**

## Execution

### Mode 1: Retrieve Existing Checklist

1. Match the user's argument to one of the 23 domains (fuzzy match: "payment" → #9, "cart" → #8, "variations" → #13, "pickup" → #15, "graphql" / "xapi" / "api" → #23)
2. Read the checklist from `domain-checklists.md` or `graphql-checklist.md`
3. Present the checklist with markdown checkboxes
4. Suggest related checklists (e.g., "Cart/Checkout" often pairs with "Payment" and "Orders"; "GraphQL" pairs with the domain it touches)

### Mode 2: Generate Checklist for JIRA Ticket

1. Fetch JIRA ticket via Atlassian MCP — extract feature scope, acceptance criteria
2. Map the ticket to affected domains (a ticket may touch 2-4 domains)
3. Merge relevant checklist items from each domain into a combined checklist
4. If the ticket involves API/GraphQL changes, also pull items from `graphql-checklist.md` — include the "New Query/Mutation Verification" section for any new or modified queries/mutations
5. Add ticket-specific items derived from acceptance criteria not covered by existing checklists
6. Output a single unified checklist with domain section headers

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
6. **Propose adding** the new checklist to `domain-checklists.md` (UI domains) or as a separate file (API/backend domains) — ask user for confirmation

### Mode 4: List All (`all` keyword)

1. Read `domain-checklists.md` and `graphql-checklist.md`
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
- For GraphQL checklists: always include the "New Query/Mutation Verification" section when a ticket introduces new queries or mutations

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `/qa-plan` | Checklists feed into test plan creation — ensures no domain is missed |
| `/qa-test-design` | Checklist items can be expanded using EP, BVA, decision tables |
| `/qa-risk` | High-risk domains get more granular checklist items |
| `/qa-sbtm` | Checklists serve as starting point for exploratory session charters |
| `/qa-api` | GraphQL checklist (#23) aligns with xAPI test execution and case generation |
| `agents/knowledge/sitemap.md` | Sitemap provides URLs and product types for UI exploration |
