---
name: qa-checklist
description: "[Testing] Generate test case writing checklists for any domain, feature, or regression area. Uses 63 built-in domain checklists (33 storefront + 29 backend/admin + 1 GraphQL) + custom creation."
argument-hint: "domain name | feature | VCST-XXXX | new <domain> | admin <module>"
disable-model-invocation: true

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
/qa-checklist all                      # List all 63 domain checklists with item counts
```

## Supporting Files

- **domain-checklists.md** — 33 storefront domain checklists with 427 items (the source of truth for storefront UI domains).
- **backend-admin-checklists.md** — 27 Admin module checklists + 2 API checklists with 255 items, aligned with Bundle v14.0.8 (53 modules). Source of truth for Admin SPA and Platform API/xAPI domains.
- **graphql-checklist.md** — GraphQL xAPI checklist with 34 items covering all xAPI modules (xCatalog, xCart, xOrder, xProfile, xCMS, xFrontend, xQuote) + per-change verification template.
- **checklist-creation-guide.md** — Methodology for creating new checklists: structure rules, quality criteria, VC-specific patterns, cross-layer verification, and examples.

## Cross-Skill References (consult when items derive test cases)

Checklist items are written to be testable; they assume readers will resolve test data and verify schemas via the canonical sources, not hardcode values:

| File | Use when |
|------|----------|
| [`../qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md) + [`test-data/aliases.json`](../../../test-data/aliases.json) | Any checklist item that mentions a specific entity (product, org, address, coupon, card, store) — resolve via `@td(ALIAS.field)` instead of inventing values |
| [`../../../agents/knowledge/api/graphql-schema.md`](../../knowledge/api/graphql-schema.md) | Any GraphQL query/mutation/field name in a checklist item — verify it exists in the live schema before deriving a test case |
| [`../../../agents/knowledge/api/graphql-test-cases-runner.md`](../../knowledge/api/graphql-test-cases-runner.md) | Authoring runner-native GraphQL test cases derived from `graphql-checklist.md` items (CSV format, `[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]` grammar) |
| [`../../../agents/knowledge/oracles/business-logic.md`](../../knowledge/oracles/business-logic.md) | **Mandatory input, not a cross-link** — see §Oracle Grounding below. A checklist item that states an expected outcome must cite the `BL-*` it restates |
| [`../../../agents/knowledge/oracles/e-commerce-edge-cases-library.md`](../../knowledge/oracles/e-commerce-edge-cases-library.md) | **Mandatory input** — the `ECL-<n>.<m>` sections are where the domain's edge-case items come FROM (§Oracle Grounding). The library names checklists as one of its own consumers (§Using This Library) |

## Oracle Grounding (mandatory)

A checklist is the release-time walk of a domain, so it has exactly two jobs the two shared oracles
already answer, and it must read them rather than re-derive them from the UI:

| Oracle | Answers | How it lands in a checklist |
|---|---|---|
| [`business-logic.md`](../../knowledge/oracles/business-logic.md) (204 `BL-*`) | *what the correct outcome IS* | Any item asserting an outcome cites the invariant it restates: `- [ ] … (BL-PRICE-001)` |
| [`e-commerce-edge-cases-library.md`](../../knowledge/oracles/e-commerce-edge-cases-library.md) (54 `ECL-<n>.<m>`) | *which boundary/failure shapes exist for this domain* | Edge-case and error-path items are derived FROM a section and cite it: `- [ ] … (ECL-1.3)` |

**Why this is mandatory and not advisory.** An item written only from UI exploration encodes what the
build currently does; an item grounded in a `BL-*` encodes what it is supposed to do — only the second
can fail on a regression the UI presents confidently. And an un-cited edge-case item is invisible to
`ecl:lint` / `bl:lint`, so a checklist can neither be credited for oracle coverage nor be repaired when
`/qa-review-oracles` amends the entry it was silently paraphrasing. Charter A of
[`../qa-sbtm/charter-library.md`](../qa-sbtm/charter-library.md) was a verbatim un-cited restatement of
ECL 1.1/1.2/1.3 for exactly this reason.

**`[OBSERVED]` → checklist, `[THEORETICAL]` → exploratory.** The ECL marks every pattern (175
`[OBSERVED]`, 36 `[THEORETICAL]`). A checklist is walked on every release under the 6–15-item budget, so
only `[OBSERVED]` patterns — confirmed on this platform — earn a slot; a `[THEORETICAL]` pattern has no
failure history here and belongs to `/qa-exploratory`, whose job is discovery. This mirrors
`/qa-test-cases-generator` §Do not add edge cases speculatively, and it is the division of labour
between the two surfaces: the checklist re-verifies what has bitten us, the session hunts what hasn't yet.

**IDs are a citation contract.** Cite an ID that exists; never invent, renumber, or guess one — a
dangling ref reads as coverage and is none — the `ecl:lint` ECLC-001 class, whose first run found 20 of them across ~65 cases, one citing a section (`13.4`) that has never existed. Verify with
`npm run bl:lint` / `npm run ecl:lint`. Neither oracle is edited from here: an item that needs an
invariant or a pattern the oracle lacks is a proposal for `/qa-review-oracles`, whose sole writer is
`ba-system-analyzer`.

## 63 Built-in Domain Checklists

### Storefront Domains (33) — `domain-checklists.md`

| # | Domain | Items | Related Suites |
|---|--------|-------|----------------|
| 1 | Auth | 8 | 01, 02, 08 |
| 2 | Catalog | 28 | 01, 03, 16 |
| 3 | Categories | 6 | 03, 16 |
| 4 | SEO | 8 | 31 |
| 5 | Add to Cart | 11 | 01, 04a |
| 6 | Search | 12 | 03, 26 |
| 7 | Ship-to Selector | 9 | 04a, 04b |
| 8 | Cart/Checkout | 19 | 04a, 04b, 06 |
| 9 | Payment | 12 | 06 |
| 10 | Orders | 11 | 01, 04c, 20 |
| 11 | Company Info | 6 | 02, 21 |
| 12 | Company Members | 12 | 02, 21 |
| 13 | Multi-Org | 13 | 02, 21 |
| 14 | Product Configurations & Variations | 58 | 36 |
| 15 | PDP (Product Detail Page) | 11 | 01, 03 |
| 16 | Google Analytics | 11 | 07 |
| 17 | Anonymous Flow | 8 | 04a, 04b |
| 18 | Cart Merge | 11 | 04a, 30 |
| 19 | BOPIS (Pickup) | 12 | 05, 30 |
| 20 | B2B Quotes & RFQ | 14 | 04c, 20 |
| 21 | B2B Lists & Quick Order | 13 | 13 |
| 22 | Localization & i18n | 7 | 10 |
| 23 | Notifications | 12 | 24 |
| 24 | White Labeling | 13 | 32, 35 |
| 25 | Account Management | 13 | 01, 02, 13 |
| 26 | Storefront Push Messages | 12 | 33 |
| 27 | Coupons & Promotions | 12 | 41, 23, 42 |
| 28 | Security | 10 | 08 |
| 29 | Accessibility | 10 | 09 |
| 30 | Performance | 8 | 11 |
| 31 | Browser Compatibility | 7 | 12 |
| 32 | B2C Features | 10 | 13 |
| 33 | Subscriptions & Recurring Orders | 10 | 14 |
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

**Total: 738 checklist items across 63 domains + 1 cross-domain checklist (storefront: 411 + admin: 244 + GraphQL detail: 83).**

## Execution

### Mode 1: Retrieve Existing Checklist

1. Match the user's argument to one of the 63 domains:
   - Storefront domains: fuzzy match ("payment" → #9, "cart" → #8, "variations" → #14, "pickup" → #19, "pdp" → #15)
   - Admin domains: `admin <module>` prefix routes to `backend-admin-checklists.md` ("admin catalog" → A1, "admin pricing" → A2, "admin orders" → A4)
   - GraphQL: "graphql" / "xapi" → `graphql-checklist.md` for detailed query/mutation checklist, or API2 for high-level xAPI coverage
   - API: "platform api" / "rest api" → API1
2. Read the checklist from `domain-checklists.md`, `backend-admin-checklists.md`, or `graphql-checklist.md`
3. Present the checklist with markdown checkboxes
4. Suggest related checklists (e.g., storefront "Cart/Checkout" pairs with admin "Orders Admin" and "Pricing Admin"; storefront "Search" pairs with admin "Search & Indexing")
5. **Report oracle coverage** — list the `BL-*` / `ECL-<n>.<m>` the retrieved items cite, then name the
   domain's `[OBSERVED]` ECL sections that NO item covers, and any outcome-asserting item carrying no
   `BL-*`. These are back-annotation candidates: offer to add the citations (and any missing
   `[OBSERVED]` item) to the stored checklist file, confirm before writing. Most items predate
   §Oracle Grounding, so this is how the corpus is burned down a domain at a time rather than in one
   unreviewable pass — never silently present an un-grounded checklist as complete.

### Mode 2: Generate Checklist for JIRA Ticket

1. Fetch JIRA ticket via Atlassian MCP — extract feature scope, acceptance criteria
2. Map the ticket to affected domains (a ticket may touch 2-4 domains)
3. Merge relevant checklist items from each domain into a combined checklist
4. If the ticket involves API/GraphQL changes, also pull items from `graphql-checklist.md` — include the "New Query/Mutation Verification" section for any new or modified queries/mutations
5. **Load the oracles for those domains** (§Oracle Grounding) — read `business-logic.md` for the
   `BL-*` invariants the ticket's surface touches, and `e-commerce-edge-cases-library.md` for the
   `ECL-<n>.<m>` sections that map to it. Do this BEFORE step 6: an AC states what the ticket
   promises, a `BL-*` states what the surrounding system already guarantees, and the second is where
   the regression risk lives — a ticket's own AC will never mention the invariant it breaks.
6. Add ticket-specific items derived from acceptance criteria not covered by existing checklists
7. Add the oracle-derived items step 5 surfaced that steps 3–6 left uncovered — each cited: an
   outcome item carries its `BL-*`, an edge-case item carries its `ECL-<n>.<m>` (`[OBSERVED]` only)
8. Output a single unified checklist with domain section headers, and state which `BL-*` / `ECL-*` the
   ticket's surface touches that this checklist deliberately does NOT cover, with the reason — an
   omission and an oversight must not look the same to the reader

### Mode 3: Create New Checklist (`new` keyword)

1. Read `checklist-creation-guide.md` for methodology
2. Identify the domain scope from the user's argument
3. **Load the oracles for the domain** (§Oracle Grounding) — the `BL-*` invariants and the
   `ECL-<n>.<m>` sections covering this surface. **Before** the UI walk, not after: exploration shows
   what the build does, the oracles say what it must do, and a checklist authored from the first alone
   canonises current behaviour as the expectation. Read first and the walk becomes a check of the
   invariants and `[OBSERVED]` patterns against the live build, rather than a transcript of it.
4. **Explore the UI** (mandatory) — navigate to the feature in the storefront or admin using Playwright to discover real labels, interactions, states
5. Apply the checklist creation methodology:
   - Map all user-visible interactions (inputs, buttons, selectors, navigation)
   - Identify state transitions and business rules — **from `business-logic.md`, cited by ID**; a rule
     you inferred from the UI and cannot tie to a `BL-*` is a proposal for `/qa-review-oracles`, not a
     checklist item stated as fact
   - Add cross-layer verification items (storefront → API → admin)
   - Add error/edge case items — **derived from the domain's `[OBSERVED]` ECL sections, each citing
     `ECL-<n>.<m>`**; `[THEORETICAL]` patterns go to `/qa-exploratory` instead
   - Add boundary value items
6. Structure with markdown checkboxes, 6-15 items per domain
7. **Propose adding** the new checklist to `domain-checklists.md` (UI domains) or as a separate file (API/backend domains) — ask user for confirmation

### Mode 4: List All (`all` keyword)

1. Read `domain-checklists.md` and `graphql-checklist.md`
2. Present summary table with domain names, item counts, and key focus areas
3. Highlight which domains are most relevant to current sprint work (if context available)

## Output Format

```markdown
### [Domain Name] — Test Case Writing Checklist

> X items | Related suites: XX, XX | Priority: P0/P1

- [ ] Item description (specific, actionable, uses real UI labels) (BL-XXX-NNN)
- [ ] Edge case derived from the library (ECL-<n>.<m>)
- ...

**Oracle coverage:** BL-* cited: … | ECL-* cited: … | `[OBSERVED]` ECL sections in this domain not covered: … (reason)

**Cross-layer checks:**
- [ ] Storefront UI reflects expected state
- [ ] No console errors or failed network requests
- [ ] Admin confirms data persisted correctly

**Related checklists:** [Domain A], [Domain B]
```

## Rules

- Every checklist item must be specific enough to derive at least one test case from it
- **Every outcome-asserting item cites its `BL-*`; every edge-case/error-path item cites its `ECL-<n>.<m>`** (§Oracle Grounding). Pure UI-presence items may omit both — that is the same carve-out `/qa-test-cases-generator` gives the `Business_Rule` column
- **Only `[OBSERVED]` ECL patterns become checklist items.** A `[THEORETICAL]` pattern is an exploratory candidate — route it to `/qa-exploratory`, do not spend a release-walk slot on it
- **Never invent, renumber, or guess an oracle ID.** A citation must resolve in the oracle as written; verify with `npm run bl:lint` / `npm run ecl:lint`. Both oracles are read-only from here — gaps become `/qa-review-oracles` proposals
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
| `/qa-sbtm` | Checklists serve as starting point for exploratory session charters. **The ECL splits between them:** `[OBSERVED]` patterns are checklist items here, `[THEORETICAL]` ones are charter material there |
| `/qa-review-oracles` | The audit that keeps the cited `BL-*`/`ECL-*` true. An item needing an invariant or pattern the oracle lacks is a proposal for that command — this skill never edits either oracle |
| `/qa-api` | GraphQL xAPI checklist aligns with xAPI test execution and case generation |
| `knowledge/domain/sitemap.md` | Sitemap provides URLs and product types for UI exploration |
