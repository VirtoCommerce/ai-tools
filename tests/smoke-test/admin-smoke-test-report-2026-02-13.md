# Admin Site Smoke Test Report

**Environment:** Virto Commerce QA Admin
**URL:** https://vcst-qa.govirto.com
**Platform Version:** 3.1003.0
**Browser:** Microsoft Edge (via playwright-edge MCP)
**Credentials:** admin / Password1!
**Date:** 2026-02-13
**Executed By:** qa-backend-expert (Claude Opus 4.6)
**Duration:** ~12 minutes

---

## Summary Results

| # | Check | Status | Notes |
|---|-------|--------|-------|
| 1 | Login & Dashboard | PASS | Login successful. Dashboard loaded with revenue metrics, customer stats, and charts. Platform v3.1003.0 confirmed. License expiration warning (expired Jan 1, 2026) noted - non-blocking. |
| 2 | Catalog Module | PASS | 23 catalogs listed. Drilled into Electronics > Headphones > "Beats by Dre Solo 2" (SKU: 16785001). Product detail blade showed all widgets: Images, Videos, Properties (1), Associations, SEO, Dimensions, Descriptions (2), Variations (5), Assets, Links, Configuration, Price ($220.52 USD), Fulfillment Centers, User Groups, Completeness, Reviews. |
| 3 | Orders Module | PASS | 7,301 total orders displayed. Opened order CO260213-00001 (Elena Mutykova, B2B-store, $1,532.16 USD, Processing). Order detail blade showed line items (2), addresses (2), totals breakdown, payment (Paid), shipment (New), and action buttons. |
| 4 | Contacts Module | PASS | "Companies and contacts" blade loaded with 540 entries. Vendors (e.g., @Efes Corporate, Amstel, IKEA) and Organizations displayed with Type and Name columns. |
| 5 | Security Module | PASS | Security blade opened with Users (1,016), Roles (39), and OAuth applications tabs. Roles tab confirmed B2B-specific roles: B2B Category Manager, B2B Marketer, B2B Order Manager, etc. |
| 6 | Stores Module | PASS | 6 stores listed: ACME Store, B2B-store, Electronics, QA Regression Store, Test Store - Full, test_Store. B2B-store detail: Catalog B2B-mixed, State Open, 14 languages (en-US default), 8 currencies (USD default), store URL configured. |
| 7 | Modules / Settings | PASS | Modules page loaded: Browse (79), Installed (79), Updates (0). All modules showing green checkmarks. Key modules confirmed: Assets Management 3.1000.0, Cart Experience API 3.953.0, Authorize.Net 3.806.0, Azure Search 3.809.0, and others. |
| 8 | Console Error Check | PASS | Only 2 console errors found - both 401 Unauthorized on `/api/shipping/pickup-locations/indexedSearchEnabled` (pre-login API call). No 500 errors. No 404 errors. No JavaScript runtime errors. No Angular framework errors. All post-login API calls returned 200/204. |

---

## Overall Result: PASS (8/8 checks passed)

---

## Observations

| Item | Details |
|------|---------|
| License | Expired on January 1, 2026. Warning banner displayed on dashboard. Non-blocking for QA testing but should be renewed for production. |
| Pre-login 401 | Two 401 errors on `/api/shipping/pickup-locations/indexedSearchEnabled` fire before authentication completes. Expected behavior - not a defect. |
| Module Count | 79 modules installed with 0 updates available. All modules active with no error states. |
| Data Volume | 23 catalogs, 7,301 orders, 540 contacts, 1,016 users, 39 roles, 6 stores - healthy data set for QA environment. |
| Performance | All pages loaded within acceptable timeframes. No noticeable lag on blade transitions or data loading. |

---

## Screenshots Captured

| File | Description |
|------|-------------|
| `screenshots/desktop/01-login-dashboard.png` | Dashboard after successful login - platform version, navigation menu, revenue metrics |
| `screenshots/desktop/02-catalog-product-detail.png` | Catalog drill-down: catalog list > Electronics > Headphones > product detail blade |
| `screenshots/desktop/03-orders-detail.png` | Order list with order detail blade (CO260213-00001, $1,532.16) |
| `screenshots/desktop/04-contacts-list.png` | Companies and contacts list (540 entries) |
| `screenshots/desktop/05-security-roles.png` | Security module - Roles tab showing 39 roles |
| `screenshots/desktop/06-stores-b2b-detail.png` | Stores list with B2B-store detail (14 languages, 8 currencies) |
| `screenshots/desktop/07-modules-list.png` | Modules page - 79 installed, 0 updates |

---

## Platform Details

- **Platform:** Virto Commerce Manager v3.1003.0
- **Admin SPA:** Angular-based blade system
- **Modules Installed:** 79
- **Search Engine:** Azure Search 3.809.0 / Elastic Search 8 (available)
- **Payment Modules:** Authorize.Net 3.806.0
- **Authentication:** Azure AD SSO 3.805.0, Google SSO (available)

---

**Conclusion:** The Virto Commerce QA Admin backend is fully operational. All core modules load correctly, data is accessible, and no critical errors were detected. The platform is ready for deeper functional and regression testing.
