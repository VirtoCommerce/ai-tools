# QA reference — knowledge files, scope, regression priorities, skills, environment

Part of the QA team framework. The always-loaded core is [`shared-instructions.md`](shared-instructions.md); this file holds detail read when a step needs one of its tables; never all upfront.

## Knowledge Base Directory

Reference files — read on-demand before each testing area, not all upfront:

| Area | File |
|------|------|
| Business Logic Invariants | `npm run bl:extract -- --domain <d>` — **or the extract already in your brief** (`bl:extract`, see §Business Logic Reference) |
| Edge-case patterns | `knowledge/oracles/e-commerce-edge-cases-library.md` — **or the extract already in your brief** (`ecl:extract`, same rule) |
| Platform Patterns | `knowledge/api/platform-patterns.md` |
| Performance Thresholds | `knowledge/execution/performance-thresholds.md` |
| Browser Quirks | `knowledge/automation/browser-quirks.md` |
| Debugging Signals | `knowledge/execution/debugging-signals.md` |
| **Domain maps — what a domain IS** | `knowledge/domain/` — one `<slug>.md` per domain. **`ls` it for the roster; never work from a list written elsewhere** |
| Test Data Generation | `skills/qa-seed-data/test-data-generation.md` |
| GraphQL xAPI Schema | `knowledge/api/graphql-schema.md` |
| **Authoring Runner-Native GraphQL Cases** | `knowledge/api/graphql-test-cases-runner.md` |
| **Live Test-Data Discovery** | `knowledge/execution/live-discovery.md` |

**Testing a feature? Read its domain map BEFORE anything else you read.** `knowledge/domain/<slug>.md`
is the feature-scoped, persistent answer to *"what is this thing and where are its surfaces"* — actors,
value chain, surface inventory per layer (back office / storefront / API), **where the layers DISAGREE**,
the shape of existing QA coverage, and the open gaps. It is what stops a run inheriting the ticket's
narrowness: the ticket names one control, the map names the whole surface that control sits in.

- **Find one:** `ls knowledge/domain/` — the directory IS the roster (catalog, products, sitemap, store
  settings, white labeling and the rest all live there). Do not work from a file list transcribed elsewhere.
- **No map for your domain?** Say so in your report and proceed from the ticket + live enumeration, then
  ask the orchestrator to run `/qa-domain-map <slug>`. Do not author one inline mid-run.
- **Stale map?** `npm run domain:check` reports freshness. A map that contradicts the live environment is
  a finding, not a licence to guess: the live observation wins for THIS run, the map gets refreshed after.
- **Shape / how one is built:** `knowledge/domain/domain-map.md` (the fill-in shape, not a map itself);
  reference implementation `knowledge/domain/b2b-organizations.md`.

**Authoring or reviewing GraphQL test cases? Read `graphql-test-cases-runner.md` first.** It is the canonical contract for the `Steps` / `Assertions` / `Cleanup` grammar used by `scripts/graphql/graphql-runner.ts` (tag list, predicate shapes, path syntax, `@td()` + capture rules, schema validation, common failure modes, authoring checklist). Do not invent tags, predicate shapes, or path syntax not documented there.

## Virto Commerce Testing Scope

```
BACKEND LAYER                          FRONTEND LAYER
├── Platform REST APIs                 ├── Storefront (Vue.js)
│   ├── Catalog, Pricing, Inventory    │   ├── Homepage / Catalog / PDP
│   ├── Orders, Customers              │   ├── Cart / Checkout / Payment
│   └── Notifications, Search          │   └── Account / Orders
├── GraphQL xAPI                       └── B2B Features
│   ├── xCatalog, xCart, xOrder            ├── Quotes, Quick Order
│   └── xCMS, ProfileApi                  └── Multi-Org, quote-based approval (BL-B2B-004)
├── Modules (install, config, perms)
└── Admin SPA (VC-Shell, blade CRUD)   UI/UX LAYER
                                       ├── Component Library (Storybook)
INTEGRATIONS                           ├── Design System (Coffee theme)
├── Payment (Skyflow, CyberSource...)  └── Accessibility (WCAG 2.2 AA)
├── Search (Elasticsearch)
└── Background Jobs (Hangfire)
```

## Critical Regression Areas (priority order)

1. **Auth:** Registration, sign-in/out, password reset, session
2. **Catalog:** Product cards, facets (short/integer/decimal/date/color/measure), sort, pagination
3. **Categories:** Multi-level navigation, breadcrumbs, pagination
4. **SEO:** Links, breadcrumbs, canonical URLs, structured data
5. **Add to Cart:** Stepper +/-, qty field, min/max, pack size, variations (B2B/B2C), configurable products
6. **Search:** Input/clear, global, within-category, history, dropdown, results page
7. **Ship-to Selector:** Favorite address, add new, show more, search
8. **Cart/Checkout:** Qty changes, select/unselect, save for later, pickup/delivery, shipping methods, payment (Skyflow/AuthorizeNet/CyberSource/DataTrance), billing, totals, place order
9. **Payment:** Form validation, processing, confirmation
10. **Orders:** Detail page, history table, filters, reorder
11. **Company Info:** Company details, logo upload, addresses, phones (Organization maintainer role)
12. **Company Members:** Invite, edit role, block/unblock, filter, search, bulk invite, role permissions
13. **Account Structure:** Personal vs corporate account differences, sidebar navigation, profile, saved cards, dashboard, addresses (personal only)
14. **Multi-Org:** Switch orgs, cart per org, ship-to per company, shared/private lists
15. **Product Configurations & Variations:** Configuration groups, variation swatches, size/color selectors, price updates on selection, stock per variation, image switching, unavailable combinations
16. **Product Page (PDP):** Image gallery, properties, pricing (list/sale/tier), stock status, reviews, related products, B2B variation matrix, configurable product sections
17. **Anonymous Flow:** Browse → add to cart → guest checkout, session persistence, login prompt at checkout
18. **Cart Merge:** Anonymous cart + sign-in → items merged, quantities summed, no duplicates lost, promo codes preserved
19. **Google Analytics:** Cart events, search events, catalog/PDP events, purchase events

## Skills Integration Pattern

Skills are methodology libraries with supporting reference files. Read the supporting file BEFORE the activity that needs it.

| When | Skill | Reference File |
|------|-------|---------------|
| Seeding test data | `/qa-seed-data` | `test-data-generation.md` |
| Starting test session | `/qa-evidence` | `evidence-capture-policy.md` |
| Deriving test cases | `/qa-test-design` | `test-design-techniques.md` |
| Generating CSV test cases | `/qa-test-cases-generator` | `test-case-template.md` |
| Prioritizing test depth | `/qa-risk` | `risk-prioritization-framework.md` |
| Exploratory testing | `/qa-sbtm` | `session-based-testing.md` |
| Investigating a bug | `/qa-investigate` | `bug-investigation-flow.md` — **follow it in order**: resolve `TEST_ENV` first (§1) → reproduce → isolate layer **and name the fix target** (layer → `repoKind` → repo, §3+§8) → gather **all** logs incl. App Insights (§4+§9) → root cause → document with the **Fix Routing** block |
| Filing a bug report | `/qa-defect` | `defect-report-templates.md` |
| Triaging a defect | `/qa-defect` | `defect-lifecycle-workflow.md` |
| Sign-off | `/qa-evidence` | `sign-off-templates.md` |
| VC documentation | VirtoOZ connector | 12 topic-scoped tools, Context7 fallback — [`../../execution/doc-sources.md`](../../execution/doc-sources.md) |
| Module mapping | `knowledge/execution/module-suite-map.md` | direct file reference |
| xAPI queries | `/qa-api ref <module>` | `xapi-query-ref.md` |

## Environment Variables (read via process.env)

Values are loaded by `config.js` from layered files (default `TEST_ENV=vcst`): `.env.defaults` → `.env.${TEST_ENV}` → `.env.local` → legacy `.env`. **Never edit a specific file by name; just use the variable.** Switch envs with `TEST_ENV=vcptcore` or `TEST_ENV=virtostart`. Secrets (passwords, tokens) live in `.env.local` (gitignored).

| Resource | Variable |
|----------|----------|
| Storefront | `FRONT_URL` |
| Admin SPA | `BACK_URL` |
| Admin creds | `ADMIN` / `ADMIN_PASSWORD` |
| User creds (fallback) | `USER_EMAIL` / `USER_PASSWORD` |
| User2 creds (fallback) | `USER2_EMAIL` / `USER2_PASSWORD` |
| Store | `STORE_ID` |
| Payment (Skyflow) | `SKYFLOW_VISA`, `SKYFLOW_MASTERCARD`, `SKYFLOW_EXPIRY`, `SKYFLOW_CVV` |

## Agent User Pool (Parallel Isolation)

When running in parallel, each browser slot uses a **dedicated test user** to prevent session/cart/order conflicts. Resolve via `@td(AGENT_POOL_SLOT_N.email)` (and `.b2b_email`, `.b2b_org`, etc.) — the alias points at `test-data/users/agent-user-pool.csv` row where `slot=N`. Match on your assigned `{{BROWSER_SERVER}}`. **The password is never resolved and typed:** its column holds a `{{NAME}}` token (`{{AGENT_SLOT1_PASSWORD}}`); type the bare NAME inside it (`AGENT_SLOT1_PASSWORD`, or `AGENT_SLOT1_PASSWORD_<ENV>` on `.env.playwright.all`) and the lane fills the value ([`browser-rules.md`](browser-rules.md)) — typing the token itself is blocked by the hook or misses silently.

| Browser Server | Personal User alias | B2B User alias |
|---------------|---------------------|----------------|
| `playwright-chrome` | `@td(AGENT_POOL_SLOT_1.email)` | `@td(AGENT_POOL_SLOT_1.b2b_email)` (org: `@td(AGENT_POOL_SLOT_1.b2b_org)`) |
| `playwright-firefox` | `@td(AGENT_POOL_SLOT_2.email)` | `@td(AGENT_POOL_SLOT_2.b2b_email)` (org: `@td(AGENT_POOL_SLOT_2.b2b_org)`) |
| `playwright-edge` | `@td(AGENT_POOL_SLOT_3.email)` | `@td(AGENT_POOL_SLOT_3.b2b_email)` (org: `@td(AGENT_POOL_SLOT_3.b2b_org)`) |

The values are the rows of `test-data/users/agent-user-pool.csv` (a customer edits that file with their own); never copy them here.

**Resolution order:** agent-user-pool.csv → `process.env` fallback (populated from `.env.${TEST_ENV}` + `.env.local`). If pool users are not seeded (`seeded=false`), fall back to `process.env` and log a warning.
**Seeding:** `test-data/users/seed-agent-users.md` — run once to create personal users on the platform.

## Platform Constraints

- WebKit NOT supported on Windows — use Edge as fallback
- xAPI GraphQL returns errors *inside* HTTP 200 — always check `response.data.errors[]`
- Payment iframes (Skyflow, CyberSource) are cross-origin — console errors NOT visible in main console
- Elasticsearch reindex lag — newly created products may not appear immediately (30-60s expected)
- CyberSource: payment form on cart page. All others: Place Order → `/checkout/payment` redirect.
