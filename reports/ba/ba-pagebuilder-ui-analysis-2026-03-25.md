# BA UI Analysis: Virto Commerce PageBuilder Module
**Date:** 2026-03-25
**Analyst:** BA System Analyzer (automated)
**Environment:** QA — `https://vcst-qa.govirto.com` / `https://vcst-qa-storefront.govirto.com`
**Scope:** Admin PageBuilder Shell (page management, Template Builder designer), Storefront CMS page rendering
**Module:** `VirtoCommerce.PageBuilderModule`
**Store:** B2B-store

---

## 1. Executive Summary

The **PageBuilder module** (`VirtoCommerce.PageBuilderModule`) is partially functional in the QA environment. The admin shell — a standalone Vue SPA (`vc-shell-framework`) embedded at `/apps/page-builder-shell/` — operates correctly: page management (create, publish, archive), status filtering (Draft/Active/Pending/Archived), search, and the in-house **Template Builder Ver. 3.0** designer all function without errors. However, storefront rendering shows a split picture: the reference page `/demo-landing` renders full CMS content correctly, while other Active pages (`/tc-e2e-001-public`) resolve with HTTP 200 but display blank content, and several pages listed as Active in admin return 404 on the storefront. Data quality issues in the page repository (missing languages, missing or malformed permalinks) indicate the repository is used as a development sandbox. Note: Builder.io is a separate external integration that also publishes into the VirtoPages index — this report focuses on the native PageBuilder module, not Builder.io.

---

## 2. Surface 1: Admin PageBuilder Shell

**URL:** `https://vcst-qa.govirto.com/apps/page-builder-shell/?storeId=B2B-store`

### 2.1 Architecture

The PageBuilder Shell is a Vue-based SPA (using `vc-shell-framework`) that is completely separate from the main Virto Commerce admin SPA (AngularJS, blade-based). It is embedded as a standalone micro-frontend at `/apps/page-builder-shell/` and uses hash-based routing for tab navigation. Authentication is shared via session cookies from the parent domain. Direct browser navigation to the shell URL resets the page context — the shell must be accessed by in-page redirect (`window.location.href`) from an already-authenticated admin session.

### 2.2 Page Repository Summary

| Tab | Count | URL Hash |
|-----|-------|----------|
| Draft | 6 | `#/page-builder-draft` |
| Active (Published) | 15 | `#/page-builder-active` |
| Pending (Scheduled) | 0 | `#/page-builder-pending` |
| Archived | 12 | `#/page-builder-archived` |
| **Total (All Pages)** | **33** | `#/page-builder` |

Counter badges in the left sidebar match the list counts on all tabs (Active: 15, Archived: 12, Pending: 0). Draft count was confirmed as 6.

### 2.3 Tab-by-Tab Observations

**Draft Tab** (`#/page-builder-draft`)
- Grid columns: Name, Language, Permalink, Modified, Modified by, Status
- 6 pages visible; all show a "Draft" status badge
- Two pages have no Language field set: "test2" and one unnamed entry
- One page has no Permalink: "test25"
- One page ("Test") has a permalink without a leading slash: `aaaaa` (should be `/aaaaa`)
- Screenshot: `pb-01-draft-tab.png`

**Active Tab** (`#/page-builder-active`)
- 15 pages displayed with "Published" status badge
- One page ("Monday") shows three simultaneous badges: Published + Scheduled + Personalized — this row's Status column truncates to "Pu...", "Sc...", "Pers..." — text overflow issue
- "Test Empty Permalink" page shows Published status but has no Permalink value
- Screenshot: `pb-02-active-tab.png`

**Pending Tab** (`#/page-builder-pending`)
- Counter shows 0; no pages with future StartDate exist
- Empty state renders correctly with no errors
- Screenshot: `pb-03-pending-tab.png`

**Archived Tab** (`#/page-builder-archived`)
- 12 pages displayed with "Archived" badge
- One anomaly: the "New_seo" page appears in Archived but shows Published + Scheduled + Personalized badges — this indicates it was published with scheduling dates that have since expired, moving it to archive state while retaining its badge metadata
- Screenshot: `pb-04-archived-tab.png`

**All Pages Tab** (`#/page-builder`)
- Shows all 33 pages in a combined list
- Search field is functional: partial match search for "test" returns relevant results, clearing works correctly
- Screenshot: `pb-05-all-pages-tab.png`, `pb-06-search-results.png`

### 2.4 Page Detail Blade

Opening a page (e.g., "TC-E2E-001") displays a right-side blade with:
- **Basic information** section: Name field, Language dropdown, Permalink field with clickable frontend URL link
- **Scheduling** section: Start date and End date pickers (collapsed by default)
- **Personalization** section: Visibility toggle, User groups dropdown, Organization dropdown (collapsed by default)
- Action buttons in the header: Save, Preview, Open Designer, Publish/Archive (context-dependent)
- The frontend URL in the blade correctly shows `https://vcst-qa-storefront.govirto.com/tc-e2e-001-public`
- Screenshot: `pb-07-page-detail-blade.png`

### 2.5 Template Builder Designer

Clicking "Open Designer" opens Virto Commerce's in-house **Template Builder Ver. 3.0** (a separate Vue SPA at `/Modules/$(VirtoCommerce.PageBuilderModule)/Content/page-builder-designer/index.html`). This is NOT Builder.io — it is VC's own drag-and-drop page composer.

- The designer loaded successfully for the TC-E2E-001 page with 0 console errors
- UI shows a left sidebar with component palette and a right-side canvas
- Page rendered blank content in the canvas (no components authored on this page)
- Cloudflare Rocket Loader `<link rel="preload">` CORS warnings appeared in DevTools — these are non-functional (Cloudflare optimization headers) and do not affect operation
- Note: A pre-existing screenshot `CMS-004-open-designer-error.png` in the project root shows a past error dialog when opening the designer — that error is **no longer reproducible** as of this analysis date
- Screenshot: `pb-08-designer-open.png`

### 2.6 Page Creation Form

Clicking the "+" Add button opens a creation form with:
- Name field (text input)
- Language dropdown (populated with store languages)
- Permalink field (text input)
- Cancel and Save buttons
- Screenshot: `pb-09-create-page-form.png`

### 2.7 Data Quality Issues Identified

| Issue | Pages Affected | Impact |
|-------|---------------|--------|
| No Language set | "test2", 1 other | Language filtering broken for these pages; storefront may not serve correct locale |
| No Permalink | "test25", "Test Empty Permalink" | Pages cannot be accessed on storefront; the Active tab showing a Published page with no permalink is a data integrity gap |
| Permalink missing leading slash | "Test" (permalink: `aaaaa`) | URL generation will produce `https://...aaaaa` instead of `https://.../aaaaa` — potential routing failure |
| Test/placeholder names in Active | "test2", "test25", "Monday", "Test", "Test Empty Permalink" | Indicates QA environment is used for development testing; not a bug but increases noise in reports |
| 3-badge row truncation | "Monday" (Published + Scheduled + Personalized) | Status column overflows — visual bug in the grid |

---

## 3. Surface 2: Admin Builder.io Settings

**Path:** Settings (gear icon) → BuilderIO

### 3.1 Findings

The Builder.io settings blade in the Virto Commerce admin contains two controls:

| Setting | Value | State |
|---------|-------|-------|
| Enable Builder.io integration | Toggle | **ON (enabled)** |
| Public API Key | Text field | Populated (key visible, not redacted in UI) |

Both settings are saved and active. A "BuilderIO" link at the top of the blade opens the Builder.io dashboard in a new tab. The VirtoPages settings (a separate entry in Store settings) has its toggle set to ON as well.

- Screenshot (Builder.io settings): `pb-10-builderio-settings.png`
- Screenshot (VirtoPages toggle): `pb-11-virtopages-settings.png`

### 3.2 Observations

- The Public API Key is displayed in plaintext in the UI — this is intentional (it is a public key, not a secret), but the field does not visually distinguish between public and private key types. A tooltip or label clarifying "Public API Key only — do not enter secret keys here" would reduce potential misconfiguration risk.
- No validation feedback is visible for the API key field (e.g., format validation or connectivity test)
- No webhook configuration UI is present in the admin settings blade — webhook setup must be done in Builder.io directly (per the architecture documented in `docs/prompts/How to test Builder.io.md`)

---

## 4. Surface 3: Storefront CMS Page Rendering

**Base URL:** `https://vcst-qa-storefront.govirto.com`

### 4.1 Pages Tested

| Permalink | Admin Status | Storefront Result | Notes |
|-----------|-------------|-------------------|-------|
| `/tc-e2e-001-public` | Active (Published) | 200 — blank content | Page route resolves, layout renders, main content area empty |
| `/new-components` | Active (Published, admin) | **404** | Route not found on storefront |
| `/lena-test` | Active (Published, admin) | **404** | Route not found on storefront |
| `/demo-landing` | Active (Published) | **200 — full content** | Rich CMS content renders correctly |
| `/test-page-123` | Active (Published, admin) | **404** | Route not found on storefront |
| `/` (homepage) | N/A (catalog-driven) | 200 — catalog content | Hero banner and Daily Deals sections load |

- Screenshot (homepage): `pb-12-storefront-homepage.png`
- Screenshot (tc-e2e-001, blank): `pb-13-storefront-tc-e2e-001.png`
- Screenshot (new-components, 404): `pb-14-storefront-new-components.png`
- Screenshot (lena-test, 404): `pb-15-storefront-lena-test.png`
- Screenshot (demo-landing, working): `pb-16-storefront-demo-landing.png`
- Screenshot (demo-landing scroll): `pb-17-storefront-demo-landing-scroll.png`
- Screenshot (test-page-123, 404): `pb-18-storefront-test-page-123.png`

### 4.2 Working Page Analysis: `/demo-landing`

The `demo-landing` page demonstrates that the CMS rendering pipeline is functional end-to-end:
- Page title: "Demo landing"
- H1: "Printers market overview"
- Hero section: image + headline + two CTA buttons ("Learn More", "Get In Touch")
- Text section: "Readability is a primary concern of a designer" with body copy
- Feature block: "Explore the features" with 3-column icon grid (Epic Aerial Video, Live HD View, Complete Control)
- All assets (images, icons) load correctly
- No JavaScript errors on page load
- No console warnings

### 4.3 Blank Content Analysis: `/tc-e2e-001-public`

The page at `/tc-e2e-001-public` resolves with HTTP 200 and renders the full site chrome (header, nav, footer, breadcrumbs showing "Home /") but the main content area is completely empty. No JavaScript errors were detected. Two possible explanations:

1. **The Template Builder designer canvas has no components authored** — the TC-E2E-001 page exists as a Published record but no content blocks were added in the designer (confirmed when viewing the designer — the canvas was blank)
2. **Content rendering pipeline successfully fetches an empty page** — the page rendering component correctly handles an empty component tree with a graceful blank render (no error state, no fallback content)

Either way, a blank Published page accessible on the storefront represents a content quality concern but not a platform defect.

### 4.4 404 Analysis: Pages Listed as Active But Returning 404

Three Active pages (`/new-components`, `/lena-test`, `/test-page-123`) return 404 on the storefront despite showing "Published" status in admin. Possible causes:

1. **Permalink mismatch** — the permalink value in admin may not match the actual route the storefront uses
2. **Language filtering** — if the page is published only for a non-default language, the en-US route may not exist
3. **Storefront cache lag** — the VirtoPages index may not have been updated (webhook not fired or delayed)
4. **Missing storefront component mapping** — vc-frontend may require explicit route registration for CMS pages beyond the VirtoPages index

The most likely cause for most test pages is that they were created as test data without completing the full storefront integration cycle (designer content + webhook + storefront cache refresh).

---

## 5. Pain Points

| # | Location | Source | Issue | Severity | Recommendation |
|---|----------|--------|-------|----------|----------------|
| PP-01 | Active tab grid — Status column | UI | Three simultaneous status badges (Published + Scheduled + Personalized) cause text truncation in the Status column: badges render as "Pu...", "Sc...", "Pers..." with no visible full text or tooltip | Medium | Expand Status column width, use abbreviated badge icons for multi-badge rows, or add a tooltip on hover to show full badge labels |
| PP-02 | Active tab | UI | A page ("Test Empty Permalink") is Published and Active but has no Permalink — it cannot be accessed on the storefront. No warning or validation indicator is shown in the admin grid or page blade | High | Add a validation warning icon in the grid for pages with missing permalink; block publishing if permalink is empty |
| PP-03 | Draft tab | UI | One page has a permalink without a leading slash (`aaaaa` instead of `/aaaaa`). The admin accepts this without warning | Medium | Validate permalink format on save: enforce leading slash, reject spaces, flag URL-unsafe characters |
| PP-04 | Draft/All tabs | UI | Some pages have no Language field set. These entries display a blank in the Language column — it is unclear which store language they belong to | Medium | Make Language a required field on page creation; add a warning indicator in the grid for pages with null language |
| PP-05 | Page blade | UI | The "Open Designer" button label and the in-house Template Builder are named inconsistently. The button says "Open Designer" but opens "Template Builder Ver. 3.0" — there is no indication of this being a different tool from Builder.io (which is also enabled). New users may be confused about which tool to use | Medium | Rename the button to "Open Template Builder" to distinguish it from the Builder.io visual editor; add contextual help text |
| PP-06 | Storefront | UI | Active pages `/new-components`, `/lena-test`, `/test-page-123` return 404 on the storefront despite being Published in admin. There is no admin-side indicator that these pages are not accessible on the storefront | High | Add a storefront reachability indicator in the page blade (e.g., green check / red X showing if the storefront URL returns 200); or surface this as a health warning in the Active tab |
| PP-07 | Storefront | UI | The page `/tc-e2e-001-public` resolves with 200 but renders blank content — the page has no authored components. There is no empty-state fallback UI (e.g., "Coming soon" or placeholder) — visitors see only a header and footer with nothing in between | Low | Add a graceful empty-state component as the default for pages with no authored content; or add an admin-side warning when publishing a page with an empty designer canvas |
| PP-08 | Builder.io settings | UI | The Public API Key field displays the key in plaintext with no masking and no label clarifying this is a public (not secret) key. While the public key is not sensitive, the lack of visual differentiation could lead an operator to enter a secret key here | Low | Add field label clarification: "Public API Key (safe to expose client-side)"; consider masked display with a show/hide toggle for consistency with other credential fields |
| PP-09 | Builder.io settings | UI | No webhook configuration UI exists in the admin settings blade. Webhook setup requires direct access to Builder.io. Operators new to the integration have no in-admin guidance on completing the webhook connection | Low | Add a "Webhook Setup Guide" link or expandable help section in the BuilderIO settings blade pointing to the configuration documentation |
| PP-10 | PageBuilder shell | Architecture | The PageBuilder Shell is a separate SPA from the main admin and requires a different navigation path. There is no link to it from the main admin sidebar — access requires knowing the direct URL (`/apps/page-builder-shell/`). This is a discoverability gap | Medium | Add a "Page Builder" entry to the main admin sidebar (Content section) that navigates to the shell URL |

---

## 6. Architecture Notes

```
┌─────────────────────────────────────────────────────────┐
│  Virto Commerce Admin SPA (AngularJS, blade-based)       │
│  https://vcst-qa.govirto.com/#!/                         │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Settings → BuilderIO                            │    │
│  │  - Enable toggle (ON)                            │    │
│  │  - Public API Key (populated)                    │    │
│  └─────────────────────────────────────────────────┘    │
│                                                          │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Store Settings → VirtoPages                     │    │
│  │  - Enable toggle (ON)                            │    │
│  └─────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  PageBuilder Shell SPA (Vue + vc-shell-framework)        │
│  /apps/page-builder-shell/?storeId=B2B-store             │
│  Hash routing: #/page-builder-{draft|active|pending|...} │
│                                                          │
│  Page CRUD → Status management → Template Builder link   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Template Builder SPA (Vue, in-house)                    │
│  /Modules/$(VirtoCommerce.PageBuilderModule)/Content/... │
│  Drag-and-drop component composer for page content       │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Builder.io (External SaaS Visual CMS)                   │
│  https://builder.io/                                     │
│  Webhook → POST /api/pages/builder-io → VirtoPages index │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  vc-frontend Storefront (Vue/Nuxt)                       │
│  https://vcst-qa-storefront.govirto.com                  │
│  Renders CMS pages via VirtoPages index lookup           │
│  Working: /demo-landing (200, full content)              │
│  Blank: /tc-e2e-001-public (200, empty canvas)           │
│  Missing: /new-components, /lena-test, /test-page-123   │
└─────────────────────────────────────────────────────────┘
```

---

## 7. Screenshot Index

| File | Surface | Description |
|------|---------|-------------|
| `pb-01-draft-tab.png` | Admin Shell | Draft tab — 6 pages, data quality issues visible |
| `pb-02-active-tab.png` | Admin Shell | Active tab — 15 pages, badge truncation on "Monday" row |
| `pb-03-pending-tab.png` | Admin Shell | Pending tab — empty (0 scheduled pages) |
| `pb-04-archived-tab.png` | Admin Shell | Archived tab — 12 pages, "New_seo" anomaly |
| `pb-05-all-pages-tab.png` | Admin Shell | All Pages tab — 33 total |
| `pb-06-search-results.png` | Admin Shell | Search functional — partial match results |
| `pb-07-page-detail-blade.png` | Admin Shell | Page detail blade — Basic info, Scheduling, Personalization sections |
| `pb-08-designer-open.png` | Admin Shell | Template Builder designer — blank canvas for TC-E2E-001 |
| `pb-09-create-page-form.png` | Admin Shell | Page creation form — Name, Language, Permalink fields |
| `pb-10-builderio-settings.png` | Admin Settings | BuilderIO settings — toggle ON, API key populated |
| `pb-11-virtopages-settings.png` | Admin Settings | VirtoPages toggle — enabled |
| `pb-12-storefront-homepage.png` | Storefront | Homepage — hero banner and Daily Deals (catalog-driven) |
| `pb-13-storefront-tc-e2e-001.png` | Storefront | `/tc-e2e-001-public` — 200 response but blank content area |
| `pb-14-storefront-new-components.png` | Storefront | `/new-components` — 404 Page Not Found |
| `pb-15-storefront-lena-test.png` | Storefront | `/lena-test` — 404 Page Not Found |
| `pb-16-storefront-demo-landing.png` | Storefront | `/demo-landing` — working CMS page with full content |
| `pb-17-storefront-demo-landing-scroll.png` | Storefront | `/demo-landing` scrolled — feature blocks render correctly |
| `pb-18-storefront-test-page-123.png` | Storefront | `/test-page-123` — 404 Page Not Found |

All screenshots are located at: `reports/ba/screenshots/`

---

## 8. Test Coverage Implications

Based on this analysis, the following test cases in the CMS regression suites are directly impacted:

| Test Case | Suite | Status Note |
|-----------|-------|-------------|
| CMS-003 Preview page | 059 | Requires a page with content in designer — use `demo-landing` as precondition |
| CMS-004 Open Designer | 059 | Working as of 2026-03-25 (previous error `CMS-004-open-designer-error.png` no longer reproducible) |
| CMS-027–035 Storefront verification | 060 | Use `/demo-landing` as the test page; avoid test-data pages that return 404 |
| CMS-053 Admin shows correct frontend URL | 059 | Verified correct for TC-E2E-001 — URL matches permalink |
| CMS-017–021 Status filter counters | 059 | Draft=6, Active=15, Pending=0, Archived=12 as of analysis date |

---

## 9. Recommendations Summary

**High Priority:**
1. Add permalink validation — block publishing if permalink is empty (PP-02)
2. Add storefront reachability health indicator in the admin Active tab or page blade (PP-06)

**Medium Priority:**
3. Fix Status column badge truncation for multi-badge rows in the page grid (PP-01)
4. Enforce leading slash in permalink format; validate on save (PP-03)
5. Make Language a required field on page creation (PP-04)
6. Add "Page Builder" navigation entry to the main admin sidebar (PP-10)
7. Rename "Open Designer" button to "Open Template Builder" to reduce confusion with Builder.io (PP-05)

**Low Priority:**
8. Add empty-state fallback for Published pages with no designer content on the storefront (PP-07)
9. Add webhook setup guidance link inside the BuilderIO settings blade (PP-09)
10. Clarify API key field label in BuilderIO settings (PP-08)
