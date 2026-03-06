# Admin UI Exploratory Analysis — Uncovered Backend Modules

**Date:** 2026-03-06
**Platform version:** 3.1007.0
**Environment:** https://vcst-qa.govirto.com (QA)
**Purpose:** Identify admin backend modules with zero test coverage in regression suites

## Executive Summary

The admin UI contains **25 Browse modules + 9 Configuration modules = 34 total**. Our 36 regression suites cover only ~20 of these. **14 modules have zero test coverage**, several of which are actively used in QA with real data.

## Modules with ZERO Test Coverage (Priority-Ranked)

### Tier 1 — Active, Data Present, Business-Critical

| # | Module | URL Route | Data Found | Key Features | Recommended Priority |
|---|--------|-----------|------------|--------------|---------------------|
| 1 | **Returns** | `#!/workspace/Return` | 11 returns (latest: today 3/6/26) | Return number, Order link, Customer, Status workflow, Item count, Search, Add new return | **P0** — Revenue-impacting, actively used |
| 2 | **Contracts** | `#!/workspace/Contract` | 3 contracts | Name, Code, Status (Active/Draft), Description, Start/End dates, Vendor, Store, Attachments, Customers, Dynamic properties, Prices widgets | **P1** — B2B feature, contract-based pricing |
| 3 | **Loyalty** | `#!/workspace/loyalty` | 1 program ("Completed order") | Active toggle, Priority, Localized names (es-ES, pl-PL), Store, Date range, **Conditions engine** (Order status = Completed), **Rewards engine** (fixed points) | **P1** — Customer retention feature |
| 4 | **Channels** | `#!/workspace/catalogPublishing` | 5 channels, 246 products | Channel name, Catalog assignment, Completeness % per product, Product grid with Pic/Name/SKU/Complete%, Pagination, Filter by completeness score | **P1** — Data quality / catalog publishing |
| 5 | **Rating and reviews** | More > Browse | Present in menu | Product ratings and review management | **P1** — Customer-facing content |

### Tier 2 — Present, Low/No Data, Functional

| # | Module | URL Route | Data Found | Key Features | Recommended Priority |
|---|--------|-----------|------------|--------------|---------------------|
| 6 | **Webhooks** | `#!/workspace/virtoCommerce.webhooksModule` | Empty list | Webhook list, Add/Remove/Refresh, Search | **P2** — Integration feature |
| 7 | **Non-integrative payment methods** | More > Browse | Present in menu | Manual/offline payment methods | **P2** — Payment configuration |
| 8 | **Subscriptions** | More > Browse | Present in menu | Subscription/recurring order management | **P2** — Revenue model feature |
| 9 | **Units of measure** | More > Browse | Present in menu | UOM management for products | **P2** — Catalog data quality |
| 10 | **Tasks** | More > Browse | Present in menu | Task management (custom icon) | **P2** — Workflow feature |
| 11 | **News** | More > Browse | Present in menu | Platform news/announcements (custom icon) | **P3** — Informational |

### Tier 3 — Configuration / DevOps

| # | Module | URL Route | Key Features | Recommended Priority |
|---|--------|-----------|--------------|---------------------|
| 12 | **GDPR** | More > Browse | GDPR compliance tools | **P2** — Compliance requirement |
| 13 | **Environments comparison** | More > Browse | Cross-environment config diff | **P2** — DevOps tool |
| 14 | **Backup and restore** | More > Configuration | Platform backup/restore | **P2** — Disaster recovery |
| 15 | **Generic export** | More > Configuration | Data export tool | **P2** — Data management |

## Returns Module — Detailed Findings

The Returns module is the highest-priority gap. Observed data:

| Return # | Order # | Customer | Status | Created | Items |
|----------|---------|----------|--------|---------|-------|
| RET260306-00001 | CO260305-00006 | Elena Mutykova | New | 3/6/26 10:06 am | 1 |
| RET260303-00004 | TEST-ACTION-001 | Elena Mutykova | New | 3/3/26 6:21 pm | 1 |
| RET260303-00003 | CO260225-00004 | Elena Mutykova | New | 3/3/26 11:24 am | 1 |
| RET260303-00002 | CO251202-00010 | Noni Burgadze | New | 3/3/26 11:24 am | 1 |
| RET260303-00001 | TEST-ACTION-001 | Elena Mutykova | New | 3/3/26 10:52 am | 1 |
| RET251016-00004 | CO251010-00012 | Aleksandra Belous-maintainer | New | 10/16/25 1:45 pm | 3 |
| ... | ... | ... | ... | ... | ... |

**Grid columns:** Return number, Order number, Customer, Return status, Create date, Modify date, Created by, Item count

**Actions:** Refresh, Add new return, Search

**Key observations:**
- All returns are in "New" status — no status transitions observed (needs workflow testing)
- Returns link to orders (cross-module relationship)
- Recent activity indicates active use by QA team
- Missing: status transitions, refund processing, inventory restoration

## Contracts Module — Detailed Findings

Fields observed:
- **Name** (text, required)
- **Code** (auto-generated, e.g., "contract-contract1")
- **Status** (dropdown: Active, likely Draft/Expired)
- **Description** (text area)
- **Start date / End date** (datetime picker)
- **Vendor** (dropdown with link to vendor entity)
- **Store** (dropdown, locked to "B2B-store")

Widgets (sub-entities):
- **Attachments** (0) — File uploads
- **Customers** (0) — Assigned customers
- **Dynamic properties** (0) — Custom fields
- **Prices** (0) — Contract-specific pricing

## Loyalty Module — Detailed Findings

Program "Completed order":
- **Is active:** Toggle (on)
- **Priority:** 0
- **Name:** "Completed order"
- **Localized names:** es-ES, pl-PL (+ more languages available)
- **Store:** B2B-store
- **Start date:** Sep 21, 2025 11:00:00 PM
- **End date:** (none)
- **Conditions engine:** "If any of the following criteria" → "Order status is Completed" (Add condition button)
- **Rewards engine:** "Get 5.00 fixed points" (Add reward button)

## Channels Module — Detailed Findings

5 channels with catalog completeness tracking:

| Channel | Catalog | Complete % |
|---------|---------|-----------|
| 1 | Beer | 0% |
| New | Beer | 71.1% |
| qa | Electronics | 41.9% |
| test | MFD | 69.9% |
| Test1 | Clothing | 83.4% |

Product grid shows per-item completeness with Pic, Name, SKU, Complete% columns. Supports filtering by completeness score (`completeness_new:[0 TO 99]`).

## Console Errors Observed

1. `Failed to load resource: /api/shipping/pickup-locations/indexedSearchEnabled` (404)
2. `Possibly unhandled rejection` in error handler

## Recommended Test Suite Plan

| New Suite | Module(s) | Est. Cases | Priority |
|-----------|-----------|-----------|----------|
| **37 — Returns Admin Tests** | Returns | 20-25 | P1 |
| **38 — Contracts Admin Tests** | Contracts | 15-20 | P1 |
| **39 — Loyalty Admin Tests** | Loyalty | 15-20 | P1 |
| **40 — Channels & Data Quality Tests** | Channels, Units of measure | 10-15 | P2 |
| **41 — Integration Admin Tests** | Webhooks, Non-integrative payments, Subscriptions | 15-20 | P2 |
| **42 — Compliance & DevOps Tests** | GDPR, Environments comparison, Backup/restore, Generic export | 10-15 | P2 |

**Estimated total: 85-115 new test cases across 6 new suites**

## Next Steps

1. **Create Suite 37 (Returns)** — Highest priority: CRUD, status workflow, order linkage, refund integration
2. **Create Suite 38 (Contracts)** — B2B critical: CRUD, customer assignment, contract pricing, date validation
3. **Create Suite 39 (Loyalty)** — Conditions engine, rewards engine, localization, store assignment
4. Integrate Returns into Orders cross-domain testing (business logic invariants)
5. Add Loyalty to frontend storefront testing (points display, redemption)
6. Update `config/test-suites.json` and `feature-domain-map.md` with new modules
