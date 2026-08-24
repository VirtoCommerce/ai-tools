# Test Suite Files Index

**Location:** `regression/suites/`
**Updated:** 2026-08-24
**Format:** Enriched Agent-Native CSV (15-column)
**Manifest:** [`config/test-suites.json`](../../config/test-suites.json) — single source of truth for orchestration (`_meta.totalSuites: 123`)

Suites are organized into **module-aligned subdirectories** under `Frontend/` and `Backend/`. IDs are
zero-padded and may carry letter suffixes for split suites (e.g. `040a`, `050b1`, `072c`).

**Totals:** 123 CSV suites (registered in the manifest) · 4,123 test cases · 56 Frontend (17 modules) + 67 Backend (33 modules).

> `Backend/import-export/096-backup-restore.csv` exists on disk but has **no manifest entry** — it is
> not counted above, does not run under any selection, and is invisible to `suites:lint`. See the
> `docs-audit` PR that last touched this file for the open proposal to register it.

---

## Frontend (56 suites, 17 modules)

| Module | Suites |
|--------|--------|
| `auth/` | 031 Auth Login & Register (P1) · 032 Auth Session & RBAC (P1) · 033 Auth Company & Account Menu (P1) · 082 Auth Impersonation / Login on Behalf (P1) |
| `b2b/` | 006 B2B Organization (P1) · 007 B2B Lists & Shared (P1) · 008 B2B Members (P1) · 009 B2B Variations & Configs (P1) · 010 B2B Bulk Ship Dashboard (P1) · 011b B2B Company E2E (P1) |
| `bopis/` | 036 BOPIS Store Selector (P1) · 037 BOPIS Cart (P1) · 038 BOPIS Checkout (P1) |
| `cart/` | 028 Cart Core (P1) · 029 Cart Validation & Persistence (P1) · 030 Cart Merge (P1) |
| `catalog/` | 001 Catalog Navigation (P1) · 002 Product Detail (P1) · 003 Catalog Filters (P1) |
| `checkout/` | 011 Checkout Flow (P1) · 012 Checkout Guest (P1) · 013 Checkout B2B (P1) · 081 Select Shipping Address Popup (P1) |
| `configurable-products/` | 072 Configurable Products UI (P1) · 072b Configurable Products E2E (P1) · 072c Configurable Products Cross-Cutting (P1) · 072d Configurable Products File & Text Sections (P1) |
| `cross-cutting/` | 043 Google Analytics (P2) · 044 Security Tests (P0) · 045 Accessibility Tests (P2) · 046 Localization Tests (P2) · 047 Performance Tests (P2) · 048 Browser Compatibility (P1) · 048c Layout Stability (runner-native) (P1) · 048d Structured Data & SEO (storefront) (P2) |
| `customer-reviews/` | 088 Customer Reviews Storefront (P2) |
| `loyalty/` | 083 Loyalty Catalog Browsing (P1) · 083b Loyalty Mixed Cart Order (P1) |
| `marketing/` | 077 Coupons & Promotions Storefront (P1) · 077b Coupons & Promotions — Cart Sidebar (P1) |
| `orders/` | 014 Orders Frontend (P1) · 015 Quotes (P1) |
| `payment/` | 039 Payment CyberSource (P0) · 040a Payment Skyflow (P0) · 040b Payment Authorize.Net (P0) · 040c Payment Datatrans (P0) · 041 Payment Cross-Cutting (P0) |
| `sales-rep/` | 089 Sales Rep — My Customers (storefront UI/E2E) (P1) · 090 Sales Rep — My Sales Reps (storefront, buyer-facing) (P1) · 091 Sales Rep — Customer Profile (storefront) (P1) · 093 Sales Rep — Hub Dashboard (storefront) (P1) |
| `search/` | 004 Search Core (P1) · 005 Search Filters & Advanced (P1) |
| `smoke/` | 042 Smoke Tests (P0) |
| `whitelabeling/` | 070 Whitelabeling Storefront (P1) · 071 Whitelabeling Branding (P1) |

## Backend (67 suites, 33 modules)

| Module | Suites |
|--------|--------|
| `api/` | 049 Platform API (P0) |
| `assets/` | 062 Assets (P1) |
| `background-jobs/` | 095 Background Jobs — Hangfire Migration (P1) |
| `catalog/` | 051 Catalog Admin Products (P1) · 053 Catalog Admin Categories (P1) |
| `channels/` | 076 Channels (P2) |
| `configurable-products/` | 052 Configurable Products Admin (P1) |
| `contracts/` | 074 Contracts (P1) |
| `customer/` | 026 Customer Contacts (P1) · 027 Customer Orgs & Invites (P1) · 027b Customer Org-Scoped Roles (P1) |
| `customer-reviews/` | 086 Customer Reviews GraphQL (xAPI) (P2) · 087 Customer Reviews Admin & Moderation (P2) |
| `graphql/` | 050a xCatalog · 050b1–050b5 xCart · 050c xOrder · 050d xProfile · 050e xFrontend (pageContext) · 050f xCMS · 050g Cross-Cutting · 050h Wishlist · 050i Configurable Products · 050j xMarketing · 050k xPickup · 050l Push Messages · 050m Sales Rep · 050n Store Asset URL (18 suites, mostly P1) |
| `image-tools/` | 069 Image Tools (P2) |
| `import-export/` | 064 CSV Import / Export (P1) |
| `inventory/` | 056 Inventory (P1) |
| `loyalty/` | 075 Loyalty (P1) · 075b Loyalty Mixed Cart Order (P1) · 075c Loyalty Product Points Earning (P1) |
| `marketing/` | 023 Promotions (P1) · 024 Content (P1) · 025 Coupons & API (P1) |
| `news/` | 084 News Articles (P1) |
| `notifications/` | 057 Templates (P1) · 058 Triggers (P1) |
| `orders/` | 017 Management (P1) · 018 Payments (P1) · 019 Shipments (P1) |
| `page-builder/` | 059 Page Builder (P1) · 060 Page Builder — Design & Content (P1) |
| `platform/` | 020 Users / Roles / Settings (P1) · 021 Dynamic Properties (P1) · 063 Core Settings (P2) |
| `pricing/` | 054 Logic (P1) · 055 Management (P1) |
| `push-messages/` | 068 Push Messages (P2) |
| `returns/` | 073 Returns (P1) |
| `sales-rep/` | 092 Sales Rep — Admin / VC-Shell App (P1) · 092b Sales Rep — Admin Embedded App (back-office) (P1) |
| `search/` | 061 Search Indexing Admin (P1) |
| `seo/` | 066 SEO (P1) |
| `shipping/` | 065 Shipping (P1) |
| `smoke/` | 078 Backend Smoke Tests (P0) |
| `store/` | 034 Management (P1) · 035 Rounding & Email (P1) |
| `task-management/` | 085 Task Management (P2) |
| `ucp/` | 094 UCP Observability (P2) |
| `whitelabeling/` | 067 Admin (P1) |
| `xmarketing/` | 079 xMarketing Admin & REST (P1) |

---

## Selection Groups

Authoritative definitions live in the manifest's `selections` block. Regenerate with
`npm run suites:sync`; verify with `npm run suites:lint`.

### By Priority / scope

| Selection | Suites | CI Command |
|-----------|--------|------------|
| `smoke` | 042, 078 | `npm run ci:smoke` |
| `critical` | 042, 078, 039, 044, 049 | `npm run ci:critical` |
| `sprint` | Plan-driven via `vc/shared/docs/Sprint plans/sprint-*-summary.json` (`--no-plan` → all P0+P1) | — |
| `full` | All 123 | `npm run ci:full` |

### By Layer

| Selection | Suites | CI Command |
|-----------|--------|------------|
| `frontend` | All `Frontend/` suites (56) | `npm run ci:frontend` |
| `backend` | All `Backend/` suites (67) | `npm run ci:backend` |

### Module / feature groups

`catalog`, `search`, `orders`, `auth`, `b2b`, `marketing`, `platform`, `bopis`, `payment`,
`configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty` — see the manifest's `selections`
for the exact suite lists.

---

## CSV Column Format

All CSV files use the enriched agent-native format (15 columns):

```
ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status
```

Authoring guides:
- Browser-mode CSV tags: [`knowledge/execution/test-runner-tags.md`](../../.claude/knowledge/execution/test-runner-tags.md)
- Runner-native GraphQL cases: [`knowledge/api/graphql-test-cases-runner.md`](../../.claude/knowledge/api/graphql-test-cases-runner.md)
- Test data resolver (`@td()` + `{{VAR}}`): [`.claude/rules/test-data.md`](../../.claude/rules/test-data.md)

---

## Related Documentation

- [test-suites.json](../../config/test-suites.json) — Regression orchestration manifest (single source of truth)
- [CLAUDE.md](../../CLAUDE.md) — Project testing overview
- [.claude/rules/regression.md](../../.claude/rules/regression.md) — Testing modes, CI pipeline, selection groups
- [module-suite-map.md](../../.claude/knowledge/execution/module-suite-map.md) — Module-to-suite mapping
- [feature-domain-map.md](../../.claude/skills/qa-coverage-gap/feature-domain-map.md) — Feature coverage tracking
- [Bug Reports](../../reports/bugs/) — Bug documentation
