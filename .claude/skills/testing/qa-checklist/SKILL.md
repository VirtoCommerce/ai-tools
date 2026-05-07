---
description: "[Testing] Generate test case writing checklists for any domain, feature, or regression area. Uses 62 built-in domain checklists (32 storefront + 29 backend/admin + 1 GraphQL) + custom creation."
argument-hint: "domain name | feature | VCST-XXXX | new <domain> | admin <module>"

---

# /qa-checklist — Test Case Writing Checklist Creation

Generate or retrieve domain-specific checklists that ensure complete test case coverage. Each checklist item maps to at least one test case.

## Usage
```
/qa-checklist auth                     # Retrieve Auth storefront checklist
/qa-checklist "product configurations" # Retrieve Product Configs & Variations checklist
/qa-checklist graphql                  # Retrieve GraphQL xAPI checklist (separate file)
/qa-checklist admin catalog            # Retrieve Catalog Admin checklist (backend file)
/qa-checklist admin pricing            # Retrieve Pricing Admin checklist
/qa-checklist VCST-1234                # Generate checklist for JIRA ticket scope
/qa-checklist new "push messages"      # Create new checklist for unlisted domain
/qa-checklist all                      # List all 62 domain checklists with item counts
```

## Supporting Files

- **domain-checklists.md** — 32 storefront domain checklists with 407 items (the source of truth for storefront UI domains).
- **backend-admin-checklists.md** — 27 Admin module checklists + 2 API checklists with 255 items, aligned with Bundle v14.0.8 (53 modules). Source of truth for Admin SPA and Platform API/xAPI domains.
- **graphql-checklist.md** — GraphQL xAPI checklist with 34 items covering all xAPI modules (xCatalog, xCart, xOrder, xProfile, xCMS, xFrontend, xQuote) + per-change verification template.
- **checklist-creation-guide.md** — Methodology for creating new checklists: structure rules, quality criteria, VC-specific patterns, cross-layer verification, and examples.

## Cross-Skill References (consult when items derive test cases)

Checklist items are written to be testable; they assume readers will resolve test data and verify schemas via the canonical sources, not hardcode values:

| File | Use when |
|------|----------|
| [`../qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md) + [`test-data/aliases.json`](../../../../test-data/aliases.json) | Any checklist item that mentions a specific entity (product, org, address, coupon, card, store) — resolve via `@td(ALIAS.field)` instead of inventing values |
| [`../../../agents/knowledge/graphql-schema.md`](../../../agents/knowledge/graphql-schema.md) | Any GraphQL query/mutation/field name in a checklist item — verify it exists in the live schema before deriving a test case |
| [`../../../agents/knowledge/graphql-test-cases-runner.md`](../../../agents/knowledge/graphql-test-cases-runner.md) | Authoring runner-native GraphQL test cases derived from `graphql-checklist.md` items (CSV format, `[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]` grammar) |
| [`../../../agents/knowledge/business-logic.md`](../../../agents/knowledge/business-logic.md) | Cross-link checklist items to `BL-*` invariants in the `Business_Rule` column of derived test cases |

## 62 Built-in Domain Checklists

### Storefront Domains (32) — `domain-checklists.md`

| # | Domain | Items | Related Suites |
|---|--------|-------|----------------|
| 1 | Auth | 8 | 01, 02, 08 |
| 2 | Catalog | 21 | 01, 03, 16 |
| 3 | Categories | 6 | 03, 16 |
| 4 | SEO | 7 | 31 |
| 5 | Add to Cart | 10 | 01, 04a |
| 6 | Search | 12 | 03, 26 |
| 7 | Ship-to Selector | 6 | 04a, 04b |
| 8 | Cart/Checkout | 17 | 04a, 04b, 06 |
| 9 | Payment | 12 | 06 |
| 10 | Orders | 7 | 01, 04c, 20 |
| 11 | Company Info | 6 | 02, 21 |
| 12 | Company Members | 12 | 02, 21 |
| 13 | Multi-Org | 11 | 02, 21 |
| 14 | Product Configurations & Variations | 56 | 36 |
| 15 | PDP (Product Detail Page) | 11 | 01, 03 |
| 16 | Google Analytics | 11 | 07 |
| 17 | Anonymous Flow | 8 | 04a, 04b |
| 18 | Cart Merge | 7 | 04a, 30 |
| 19 | BOPIS (Pickup) | 12 | 05, 30 |
| 20 | B2B Quotes & RFQ | 13 | 04c, 20 |
| 21 | B2B Lists & Quick Order | 12 | 13 |
| 22 | Localization & i18n | 7 | 10 |
| 23 | Notifications | 12 | 24 |
| 24 | White Labeling | 13 | 32, 35 |
| 25 | Account Management | 12 | 01, 02, 13 |
| 26 | Storefront Push Messages | 12 | 33 |
| 27 | Coupons & Promotions | 12 | 41, 23, 42 |
| 28 | Security | 10 | 08 |
| 29 | Accessibility | 10 | 09 |
| 30 | Performance | 8 | 11 |
| 31 | Browser Compatibility | 7 | 12 |
| 32 | B2C Features | 10 | 13 |
| **BF** | **Bug Fix Verification** | **10** | *per bug* |

### Backend & Admin Modules (29) — `backend-admin-checklists.md`

Aligned with **Bundle v14.0.8** (Platform 3.1007.2, 53 modules).

| # | Domain | Module(s) | Items | Related Suites |
|---|--------|-----------|-------|----------------|
| A1 | Catalog Admin | VirtoCommerce.Catalog | 12 | 16 |
| A2 | Pricing Admin | VirtoCommerce.Pricing | 10 | 19 |
| A3 | Inventory Admin | VirtoCommerce.Inventory | 9 | 22 |
| A4 | Orders Admin | VirtoCommerce.Orders | 10 | 20 |
| A5 | Customer Admin | VirtoCommerce.Customer | 10 | 21 |
| A6 | Marketing Admin | VirtoCommerce.Marketing | 10 | 23 |
| A7 | Store Admin | VirtoCommerce.Store | 9 | 18 |
| A8 | Notifications Admin | VirtoCommerce.Notifications | 9 | 24 |
| A9 | Content & Pages (CMS) | Content, Pages, PageBuilderModule | 10 | 25 |
| A10 | Search & Indexing | Search, ElasticSearch8 | 9 | 26 |
| A11 | Assets Admin | Assets, AzureBlobAssets | 8 | 27 |
| A12 | Core Settings | VirtoCommerce.Core | 9 | 28 |
| A13 | Platform Security & Users | Platform Core | 10 | 17 |
| A14 | CSV Import/Export | CatalogCsvImportModule, Export | 10 | 29 |
| A15 | Shipping Admin | VirtoCommerce.Shipping | 8 | 30 |
| A16 | SEO & Sitemaps | Seo, Sitemaps | 9 | 31 |
| A17 | Image Tools | VirtoCommerce.ImageTools | 8 | 34 |
| A18 | Tax | Tax, AvalaraTax | 7 | — |
| A19 | Subscriptions | VirtoCommerce.Subscription | 8 | — |
| A20 | WebHooks | VirtoCommerce.WebHooks | 7 | — |
| A21 | Customer Reviews | VirtoCommerce.CustomerReviews | 7 | — |
| A22 | Dynamic Associations | DynamicAssociationsModule | 6 | — |
| A23 | Bulk Actions | BulkActionsModule | 6 | — |
| A24 | GDPR | VirtoCommerce.GDPR | 5 | — |
| A25 | Catalog Personalization | CatalogPersonalization | 5 | — |
| A26 | Catalog Publishing | CatalogPublishing | 5 | 40 |
| A27 | Payment Admin | Payment, AuthorizeNetPayment | 6 | — |
| API1 | Platform REST API | Platform | 10 | 14 |
| API2 | GraphQL xAPI | Xapi, XCart, XCatalog, XOrder | 12 | 15 |

### GraphQL xAPI Detail (1) — `graphql-checklist.md`

| # | Domain | Items | Related Suites |
|---|--------|-------|----------------|
| GQL | GraphQL Queries & Mutations | 34 | 15 |

Sections: xCatalog (4), xCart Lifecycle (9), xCart Configurable (2), xCart Wishlists & Saved (2), xOrder (2), xProfile (6), xQuote (2), xCMS & xFrontend (2), Cross-Cutting (3), New Query/Mutation Verification (8).

**Total: 696 checklist items across 62 domains + 1 cross-domain checklist (storefront: 407 + admin: 255 + GraphQL detail: 34).**

## Execution

### Mode 1: Retrieve Existing Checklist

1. Match the user's argument to one of the 67 domains:
   - Storefront domains: fuzzy match ("payment" → #9, "cart" → #8, "variations" → #14, "pickup" → #19, "pdp" → #15)
   - Admin domains: `admin <module>` prefix routes to `backend-admin-checklists.md` ("admin catalog" → A1, "admin pricing" → A2, "admin orders" → A4)
   - GraphQL: "graphql" / "xapi" → `graphql-checklist.md` for detailed query/mutation checklist, or API2 for high-level xAPI coverage
   - API: "platform api" / "rest api" → API1
2. Read the checklist from `domain-checklists.md`, `backend-admin-checklists.md`, or `graphql-checklist.md`
3. Present the checklist with markdown checkboxes
4. Suggest related checklists (e.g., storefront "Cart/Checkout" pairs with admin "Orders Admin" and "Pricing Admin"; storefront "Search" pairs with admin "Search & Indexing")

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
