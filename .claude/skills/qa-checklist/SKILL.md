---
name: qa-checklist
description: "[Testing] Generate test case writing checklists for any domain, feature, or regression area. Uses the built-in domain checklists (storefront + backend/admin + GraphQL) + custom creation."
argument-hint: "domain name | feature | VCST-XXXX | new <domain> | admin <module>"


---

# /qa-checklist — Test Case Writing Checklist Creation

Generate or retrieve domain-specific checklists that ensure complete test case coverage. Each checklist item maps to at least one test case.

## Usage
```
/qa-checklist auth                     # Retrieve Auth storefront checklist
/qa-checklist "product configurations" # Retrieve Product Configs & Variations checklist
/qa-checklist loyalty                  # Retrieve Loyalty & Rewards (Storefront) checklist
/qa-checklist graphql                  # Retrieve GraphQL xAPI checklist (separate file)
/qa-checklist admin catalog            # Retrieve Catalog Admin checklist (backend file)
/qa-checklist admin pricing            # Retrieve Pricing Admin checklist
/qa-checklist VCST-1234                # Generate checklist for JIRA ticket scope
/qa-checklist new "push messages"      # Create new checklist for unlisted domain
/qa-checklist all                      # List every domain checklist with item counts
```

## Supporting Files

- **domain-checklists.md** — the storefront domain checklists. Source of truth for storefront UI domains.
- **backend-admin-checklists.md** — the Admin module checklists + the two API checklists, aligned with Bundle v14.0.8. Source of truth for Admin SPA and Platform API/xAPI domains.
- **graphql-checklist.md** — the per-query/mutation GraphQL xAPI checklist covering every xAPI module (xCatalog, xCart, xOrder, xProfile, xCMS, xFrontend, xQuote, xMarketing) + a per-change verification template.
- **checklist-creation-guide.md** — Methodology for creating new checklists: structure rules, quality criteria, VC-specific patterns, cross-layer verification, and examples.

**Counts are derived, never transcribed here.** `npm run checklists:count` prints every section
and its item count across the three files (`-- --json` for machine use); that script's own header
records why it exists. The tables below carry only what does not drift with an edit: id, name, suites.

## Cross-Skill References (consult when items derive test cases)

Checklist items are written to be testable; they assume readers will resolve test data and verify schemas via the canonical sources, not hardcode values:

| File | Use when |
|------|----------|
| [`../qa-postman/test-data-fixtures.md`](../qa-postman/test-data-fixtures.md) + [`test-data/aliases.json`](../../../test-data/aliases.json) | Any checklist item that mentions a specific entity (product, org, address, coupon, card, store) — resolve via `@td(ALIAS.field)` instead of inventing values |
| [`../../../agents/knowledge/api/graphql-schema.md`](../../knowledge/api/graphql-schema.md) | Any GraphQL query/mutation/field name in a checklist item — verify it exists in the live schema before deriving a test case |
| [`../../../agents/knowledge/api/graphql-test-cases-runner.md`](../../knowledge/api/graphql-test-cases-runner.md) | Authoring runner-native GraphQL test cases derived from `graphql-checklist.md` items (CSV format, `[GQL-OP]/[GQL-VARS]/[GQL-EXEC]/[GQL-CAPTURE]` grammar) |
| [`../../../agents/knowledge/oracles/business-logic.md`](../../knowledge/oracles/business-logic.md) | **Mandatory input, not a cross-link** — see §Oracle Grounding below. A checklist item that states an expected outcome must cite the `BL-*` it restates |
| [`../../../agents/knowledge/oracles/e-commerce-edge-cases-library.md`](../../knowledge/oracles/e-commerce-edge-cases-library.md) | **Mandatory input** — the `ECL-<n>.<m>` sections are where the domain's edge-case items come FROM (§Oracle Grounding). The library names checklists as one of its own consumers (§Using This Library) |
| [`../../knowledge/domain/<slug>.md`](../../knowledge/domain/) | A domain map exists for this surface — read it before the UI walk (Mode 3 step 4) for the surface inventory, the layer disagreements and the existing coverage shape. It never grounds an assertion, and its live rows are dated |

## Oracle Grounding (mandatory)

A checklist is the release-time walk of a domain, so it has exactly two jobs the two shared oracles
already answer, and it must read them rather than re-derive them from the UI:

| Oracle | Answers | How it lands in a checklist |
|---|---|---|
| [`business-logic.md`](../../knowledge/oracles/business-logic.md) (`BL-*`) | *what the correct outcome IS* | Any item asserting an outcome cites the invariant it restates: `- [ ] … (BL-PRICE-001)` |
| [`e-commerce-edge-cases-library.md`](../../knowledge/oracles/e-commerce-edge-cases-library.md) (`ECL-<n>.<m>`) | *which boundary/failure shapes exist for this domain* | Edge-case and error-path items are derived FROM a section and cite it: `- [ ] … (ECL-1.3)` |

`npm run bl:lint` / `npm run ecl:lint` print how many of each exist and validate every citation.

**Why this is mandatory and not advisory.** An item written only from UI exploration encodes what the
build currently does; an item grounded in a `BL-*` encodes what it is supposed to do — only the second
can fail on a regression the UI presents confidently. And an un-cited edge-case item is invisible to
`ecl:lint` / `bl:lint`, so a checklist can neither be credited for oracle coverage nor be repaired when
`/qa-review-oracles` amends the entry it was silently paraphrasing. Charter A of
[`../qa-sbtm/charter-library.md`](../qa-sbtm/charter-library.md) was a verbatim un-cited restatement of
ECL 1.1/1.2/1.3 for exactly this reason.

**`[OBSERVED]` → checklist, `[THEORETICAL]` → exploratory.** The ECL marks every pattern as one or the
other. A checklist is walked on every release under the 6–15-item budget, so only `[OBSERVED]`
patterns — confirmed on this platform — earn a slot; a `[THEORETICAL]` pattern has no failure history
here and belongs to `/qa-exploratory`, whose job is discovery. This mirrors
`/qa-test-cases-generator` §Do not add edge cases speculatively: the checklist re-verifies what has
bitten us, the session hunts what hasn't yet.

**IDs are a citation contract.** Cite an ID that exists; never invent, renumber or guess one — a
dangling ref reads as coverage and is none (the `ecl:lint` ECLC-001 class, whose first run found 20 of
them, one citing a section that has never existed). Neither oracle is edited from here: an item needing
an invariant or pattern the oracle lacks is a proposal for `/qa-review-oracles`, whose sole writer is
`ba-system-analyzer`. A **reserved** id (one the oracle skips deliberately, e.g. `BL-LOY-011`) has
nothing to cite and is not a gap.

## Built-in Domain Checklists

Run `npm run checklists:count` for the per-domain item counts. The tables below are the routing index.

### Storefront Domains — `domain-checklists.md`

| # | Domain | Related Suites |
|---|--------|----------------|
| 1 | Auth | 01, 02, 08 |
| 2 | Catalog | 01, 03, 16 |
| 3 | Categories | 03, 16 |
| 4 | SEO | 31 |
| 5 | Add to Cart | 01, 04a |
| 6 | Search | 03, 26 |
| 7 | Ship-to Selector | 04a, 04b |
| 8 | Cart/Checkout | 04a, 04b, 06 |
| 9 | Payment | 06 |
| 10 | Orders | 01, 04c, 20 |
| 11 | Company Info | 02, 21 |
| 12 | Company Members | 02, 21 |
| 13 | Multi-Org | 02, 21 |
| 14 | Product Configurations & Variations | 36 |
| 15 | PDP (Product Detail Page) | 01, 03 |
| 16 | Google Analytics | 07 |
| 17 | Anonymous Flow | 04a, 04b |
| 18 | Cart Merge | 04a, 30 |
| 19 | BOPIS (Pickup) | 05, 30 |
| 20 | B2B Quotes & RFQ | 04c, 20 |
| 21 | B2B Lists & Quick Order | 13 |
| 22 | Localization & i18n | 10 |
| 23 | Notifications | 24 |
| 24 | White Labeling | 32, 35 |
| 25 | Account Management | 01, 02, 13 |
| 26 | Storefront Push Messages | 33 |
| 27 | Coupons & Promotions | 41, 23, 42 |
| 28 | Security | 08 |
| 29 | Accessibility | 09 |
| 30 | Performance | 11 |
| 31 | Browser Compatibility | 12 |
| 32 | B2C Features | 13 |
| 33 | Subscriptions & Recurring Orders | 14 |
| 34 | Loyalty & Rewards (Storefront) | 075, 075b, 075c, 083, 083b, 083c, 083d |
| 35 | Sales Rep Hub (Storefront) | 089, 090, 091, 093, 097 |
| **BF** | **Bug Fix Verification** | *per bug* |

### Backend & Admin Modules — `backend-admin-checklists.md`

Aligned with **Bundle v14.0.8** (Platform 3.1007.2).

| # | Domain | Related Suites |
|---|--------|----------------|
| A1 | Catalog Admin | 16 |
| A2 | Pricing Admin | 19 |
| A3 | Inventory Admin | 22 |
| A4 | Orders Admin | 20 |
| A5 | Customer Admin | 21 |
| A6 | Marketing Admin | 23 |
| A7 | Store Admin | 18 |
| A8 | Notifications Admin | 24 |
| A9 | Content & Pages (CMS) | 25 |
| A10 | Search & Indexing | 26 |
| A11 | Assets Admin | 27 |
| A12 | Core Settings | 28 |
| A13 | Platform Security & Users | 17 |
| A14 | CSV Import/Export | 29 |
| A15 | Shipping Admin | 30 |
| A16 | SEO & Sitemaps | 31 |
| A17 | Image Tools | 34 |
| A18 | Tax | — |
| A19 | Subscriptions | — |
| A20 | WebHooks | — |
| A21 | Customer Reviews | — |
| A22 | Dynamic Associations | — |
| A23 | Bulk Actions | — |
| A24 | GDPR | — |
| A25 | Catalog Personalization | — |
| A26 | Catalog Publishing | 40 |
| A27 | Payment Admin | — |
| A28 | Sales Rep Admin | 092, 092b |
| API1 | Platform REST API | 14 |
| API2 | GraphQL xAPI | 15 |

### GraphQL xAPI Detail — `graphql-checklist.md`

One checklist, suite 15. Sections: xCatalog · xCart Lifecycle & Checkout · xCart Configurable
Products · xCart Wishlists & Saved for Later · xOrder · xProfile · xQuote · xCMS & xFrontend ·
**xMarketing — Promotion Coupons** · Cross-Cutting · New Query/Mutation Verification.

**Loyalty has no section here.** The loyalty xAPI surface is 3 queries and 0 loyalty-specific
mutations, and its invariants are walked from storefront domain 34 — except `BL-LOY-013`
(`order.orderTotals` per-currency), which belongs in this file and is not yet written.

## Execution

### Mode 1: Retrieve Existing Checklist

1. Match the user's argument to a domain:
   - Storefront domains: fuzzy match ("payment" → #9, "cart" → #8, "variations" → #14, "pickup" → #19, "pdp" → #15, "loyalty"/"points"/"rewards"/"missions" → #34, "sales rep"/"salesrep"/"rep hub" → #35, and `admin sales rep` → A28)
   - Admin domains: `admin <module>` prefix routes to `backend-admin-checklists.md` ("admin catalog" → A1, "admin pricing" → A2, "admin orders" → A4)
   - GraphQL: "graphql" / "xapi" → `graphql-checklist.md` for detailed query/mutation checklist, or API2 for high-level xAPI coverage
   - API: "platform api" / "rest api" → API1
2. Read the checklist from `domain-checklists.md`, `backend-admin-checklists.md`, or `graphql-checklist.md`
3. Present the checklist with markdown checkboxes
4. Suggest related checklists (e.g., storefront "Cart/Checkout" pairs with admin "Orders Admin" and "Pricing Admin"; storefront "Search" pairs with admin "Search & Indexing"; storefront "Loyalty" pairs with "Cart/Checkout" and "Orders")
5. **Report oracle coverage** — list the `BL-*` / `ECL-<n>.<m>` the retrieved items cite, then name the
   domain's `[OBSERVED]` ECL sections that NO item covers, and any outcome-asserting item carrying no
   `BL-*`. These are back-annotation candidates: offer to add the citations (and any missing
   `[OBSERVED]` item) to the stored checklist file, confirm before writing. Nearly every item predates
   §Oracle Grounding, so this is how the corpus is burned down a domain at a time rather than in one
   unreviewable pass. Never silently present an un-grounded checklist as complete.

### Mode 2: Generate Checklist for JIRA Ticket

1. Fetch JIRA ticket via Atlassian MCP — extract feature scope, acceptance criteria
2. Map the ticket to affected domains (a ticket may touch 2-4 domains)
3. Merge relevant checklist items from each domain into a combined checklist
4. If the ticket involves API/GraphQL changes, also pull items from `graphql-checklist.md` — include the "New Query/Mutation Verification" section for any new or modified queries/mutations
5. **Load the oracles for those domains** (§Oracle Grounding), BEFORE step 6: an AC states what the
   ticket promises, a `BL-*` states what the surrounding system already guarantees, and the second is
   where the regression risk lives — a ticket's own AC never mentions the invariant it breaks.
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
4. **Read the domain map if one exists** — `knowledge/domain/<slug>.md`. It gives the surface
   inventory, the routes, the layer disagreements and the existing coverage shape, so the walk starts
   from what is known instead of rediscovering it. It does **not** substitute for the walk: its live
   rows are dated, and a label it records may have changed since (measured 2026-09-18, one had).
   A map row your walk contradicts is a DRIFT to report back, not a number to quote.
5. **Explore the UI** (mandatory) — navigate to the feature in the storefront or admin using Playwright
   to discover real labels, interactions, states. Leave the environment as you found it: a fixture
   account's cart, balance or data is shared with the suites that run against it.
6. Apply the methodology in `checklist-creation-guide.md` Steps 3–5 — map interactions to items, add
   cross-layer verification, add the VC-specific patterns. Two constraints that are this skill's, not
   the guide's: a state-transition or business-rule item comes **from `business-logic.md`, cited by
   ID** (a rule you inferred from the UI and cannot tie to a `BL-*` is a `/qa-review-oracles` proposal,
   not a fact), and an error/edge-case item is derived from an `[OBSERVED]` ECL section and cites its
   `ECL-<n>.<m>` (`[THEORETICAL]` goes to `/qa-exploratory`)
7. Structure with markdown checkboxes, 6-15 items per domain. State the invariants this checklist
   deliberately does **not** cover and where they belong instead
8. **Propose adding** the new checklist to `domain-checklists.md` (UI domains) or as a separate file
   (API/backend domains) — ask user for confirmation. On write: add the summary-table row, the section,
   and re-derive the header count with `npm run checklists:count` rather than incrementing by hand

### Mode 4: List All (`all` keyword)

1. Run `npm run checklists:count` — it reads all three files and prints every section with its item count
2. Present the summary table with domain names, item counts, and key focus areas
3. Highlight which domains are most relevant to current sprint work (if context available)

## Output Format

```markdown
### [Domain Name] — Test Case Writing Checklist

> X items | Related suites: XX, XX | Priority: P0/P1

- [ ] Item description (specific, actionable, uses real UI labels) (BL-XXX-NNN)
- [ ] Edge case derived from the library (ECL-<n>.<m>)
- ...

**Oracle coverage:** BL-* cited: … | ECL-* cited: … | `[OBSERVED]` ECL sections in this domain not covered: … (reason)
**Not covered, deliberately:** <ID> (reason / where it belongs instead)

**Cross-layer checks:**
- [ ] Storefront UI reflects expected state
- [ ] No console errors or failed network requests
- [ ] Admin confirms data persisted correctly

**Related checklists:** [Domain A], [Domain B]
```

## Rules

- Every checklist item must be specific enough to derive at least one test case from it
- **Every outcome-asserting item cites its `BL-*`; every edge-case/error-path item cites its `ECL-<n>.<m>`** (§Oracle Grounding). Pure UI-presence items may omit both — that is the same carve-out `/qa-test-cases-generator` gives the `Business_Rule` column
- **Only `[OBSERVED]` ECL patterns become checklist items**, and **never invent, renumber or guess an oracle ID** — both per §Oracle Grounding. Verify with `npm run bl:lint` / `npm run ecl:lint`
- **Never transcribe a count into this file or into a checklist's prose.** `npm run checklists:count` prints them; a number typed here is correct once and stale thereafter
- Use REAL UI labels discovered from exploration (not generic terms)
- Keep items actionable — start with a verb or UI element name
- 6-15 items per domain (fewer = incomplete, more = too granular). Over the band is allowed when the domain spans several surfaces — say so and say why, rather than dropping a P0 invariant to fit
- Always include cross-layer verification items for P0/P1 domains
- New checklists must be validated against the live environment before delivery
- Link back to E2E scenario catalog (`../qa-plan/e2e-scenario-catalog.md`) for related scenarios — and only to an `E2E-*` id that exists there; leave the column empty rather than coining one
- For GraphQL checklists: always include the "New Query/Mutation Verification" section when a ticket introduces new queries or mutations

## Integration with Other Skills

| Skill | Relationship |
|-------|-------------|
| `/qa-plan` | Checklists feed into test plan creation — ensures no domain is missed |
| `/qa-test-design` | Checklist items can be expanded using EP, BVA, decision tables |
| `/qa-risk` | High-risk domains get more granular checklist items |
| `/qa-sbtm` | Checklists serve as starting point for exploratory session charters. **The ECL splits between them:** `[OBSERVED]` patterns are checklist items here, `[THEORETICAL]` ones are charter material there |
| `/qa-review-oracles` | The audit that keeps the cited `BL-*`/`ECL-*` true. An item needing an invariant or pattern the oracle lacks is a proposal for that command — this skill never edits either oracle |
| `/qa-domain-map` | Builds the `knowledge/domain/<slug>.md` a Mode 3 walk starts from, and owns the fix when a walk finds one of its rows drifted |
| `/qa-api` | GraphQL xAPI checklist aligns with xAPI test execution and case generation |
| `knowledge/domain/sitemap.md` | Sitemap provides URLs and product types for UI exploration |
