# Test Suite Files Index

**Location:** `regression/suites/`
**Updated:** 2026-06-12
**Format:** Enriched Agent-Native CSV (15-column)
**Manifest:** [`config/test-suites.json`](../../config/test-suites.json) — single source of truth for orchestration (`_meta.totalSuites: 104`)

Suites are organized into **module-aligned subdirectories** under `Frontend/` and `Backend/`. IDs are
zero-padded and may carry letter suffixes for split suites (e.g. `040a`, `050b1`, `072c`).

**Totals:** 104 CSV suites · ~3,790 test cases · 48 Frontend (15 modules) + 56 Backend (29 modules).
The master release suite `080` is defined in the manifest (`_release/080-full-regression-release.csv`).

---

## Frontend (48 suites, 15 modules)

| Module | Suites |
|--------|--------|
| `auth/` | 031 Login & Register (P1) · 032 Session & RBAC (P1) · 033 Company & Account Menu (P1) · 082 Impersonation / Login-on-Behalf (P1) |
| `b2c/` | 006 Organization (P1) · 007 Lists & Shared (P1) · 008 Members (P1) · 009 Variations & Configs (P1) · 010 Bulk / Ship / Dashboard (P1) |
| `bopis/` | 036 Store Selector (P1) · 037 Cart (P1) · 038 Checkout (P1) |
| `cart/` | 028 Core (P1) · 029 Validation & Persistence (P1) · 030 Merge (P1) |
| `catalog/` | 001 Navigation (P1) · 002 Product Detail (P1) · 003 Filters (P1) |
| `checkout/` | 011 Flow (P1) · 012 Guest (P1) · 013 B2B (P1) · 081 Select Shipping Address Popup (P1) |
| `configurable-products/` | 072 UI (P1) · 072b E2E (P1) · 072c Cross-Cutting (P1) · 072d File & Text Sections (P1) |
| `cross-cutting/` | 043 Google Analytics (P2) · 044 Security (P0) · 045 Accessibility (P2) · 046 Localization (P2) · 047 Performance (P2) · 048 Browser Compatibility (P1) · 048b Layout Stability (P1) |
| `loyalty/` | 083 Loyalty Catalog Browsing (P1) |
| `marketing/` | 077 Coupons & Promotions Storefront (P1) · 077b Coupons & Promotions — Cart Sidebar (P1) |
| `orders/` | 014 Orders Frontend (P1) · 015 Quotes (P1) |
| `payment/` | 039 CyberSource (P0) · 040a Skyflow (P0) · 040b Authorize.Net (P0) · 040c Datatrans (P0) · 041 Cross-Cutting (P0) |
| `search/` | 004 Core (P1) · 005 Filters & Advanced (P1) |
| `smoke/` | 042 Smoke Tests (P0) |
| `whitelabeling/` | 070 Storefront (P1) · 071 Branding (P1) |

## Backend (56 suites, 29 modules)

| Module | Suites |
|--------|--------|
| `api/` | 049 Platform REST API (P0) |
| `assets/` | 062 Assets (P1) |
| `catalog/` | 051 Admin Products (P1) · 053 Admin Categories (P1) |
| `channels/` | 076 Channels (P2) |
| `cms/` | 059 Page Management (P1) · 060 Design & Content (P1) |
| `configurable-products/` | 052 Admin (P1) |
| `contracts/` | 074 Contracts (P1) |
| `customer/` | 026 Contacts (P1) · 027 Orgs & Invites (P1) |
| `graphql/` | 050a xCatalog · 050b1–050b5 xCart · 050c xOrder · 050d xProfile · 050e xFrontend (pageContext) · 050f xCMS · 050g Cross-Cutting · 050h Wishlist · 050i Configurable Products · 050j xMarketing · 050k xPickup · 050l Push Messages (16 suites, mostly P1) |
| `image-tools/` | 069 Image Tools (P2) |
| `import-export/` | 064 CSV Import / Export (P1) |
| `inventory/` | 056 Inventory (P1) |
| `loyalty/` | 075 Loyalty (P1) |
| `marketing/` | 023 Promotions (P1) · 024 Content (P1) · 025 Coupons & API (P1) |
| `news/` | 084 News Articles (P1) |
| `notifications/` | 057 Templates (P1) · 058 Triggers (P1) |
| `orders/` | 017 Management (P1) · 018 Payments (P1) · 019 Shipments (P1) |
| `platform/` | 020 Users / Roles / Settings (P1) · 021 Dynamic Properties (P1) · 063 Core Settings (P2) |
| `pricing/` | 054 Logic (P1) · 055 Management (P1) |
| `push-messages/` | 068 Push Messages (P2) |
| `returns/` | 073 Returns (P1) |
| `search/` | 061 Search Indexing Admin (P1) |
| `seo/` | 066 SEO (P1) |
| `shipping/` | 065 Shipping (P1) |
| `smoke/` | 078 Backend Smoke Tests (P0) |
| `store/` | 034 Management (P1) · 035 Rounding & Email (P1) |
| `task-management/` | 085 Task Management (P2) |
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
| `release` | 080 | — |
| `layout-stability` | 048b | — |
| `sprint` | Plan-driven via `vc/shared/docs/Sprint plans/sprint-*-summary.json` (`--no-plan` → all P0+P1) | — |
| `full` | All 104 | `npm run ci:full` |

### By Layer

| Selection | Suites | CI Command |
|-----------|--------|------------|
| `frontend` | All `Frontend/` suites (48) | `npm run ci:frontend` |
| `backend` | All `Backend/` suites (56) | `npm run ci:backend` |

### Module / feature groups

`catalog`, `search`, `orders`, `auth`, `b2c`, `marketing`, `platform`, `bopis`, `payment`,
`configurable-products`, `whitelabeling`, `purchase-flow`, `loyalty` — see the manifest's `selections`
for the exact suite lists.

---

## CSV Column Format

All CSV files use the enriched agent-native format (15 columns):

```
ID,Title,Section,Priority,Business_Rule,Edge_Case_Refs,Preconditions,Test_Data,Steps,Assertions,Cross_Layer_Checks,Failure_Signals,Cleanup,References,Automation_Status
```

Authoring guides:
- Browser-mode CSV tags: [`.claude/agents/knowledge/test-runner-tags.md`](../../.claude/agents/knowledge/test-runner-tags.md)
- Runner-native GraphQL cases: [`.claude/agents/knowledge/graphql-test-cases-runner.md`](../../.claude/agents/knowledge/graphql-test-cases-runner.md)
- Test data resolver (`@td()` + `{{VAR}}`): [`.claude/rules/test-data.md`](../../.claude/rules/test-data.md)

---

## Related Documentation

- [test-suites.json](../../config/test-suites.json) — Regression orchestration manifest (single source of truth)
- [CLAUDE.md](../../CLAUDE.md) — Project testing overview
- [.claude/rules/regression.md](../../.claude/rules/regression.md) — Testing modes, CI pipeline, selection groups
- [module-suite-map.md](../../.claude/agents/knowledge/module-suite-map.md) — Module-to-suite mapping
- [feature-domain-map.md](../../.claude/skills/testing/qa-coverage-gap/feature-domain-map.md) — Feature coverage tracking
- [Bug Reports](../../reports/bugs/) — Bug documentation
