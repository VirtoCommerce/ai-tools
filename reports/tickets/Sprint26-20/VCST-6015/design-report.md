# VCST-6015 — Step 4v visual / a11y lane (ui-ux-expert)

Stand: vcst-qa-storefront, theme 2.60.0-alpha.2579 (Coffee), Chrome DevTools MCP. Date 2026-10-15.
Accounts (UI sign-in, no persistent profile was signed in): rep `SALES_REP`, Advanced rep `SR_REP_DOCS` (Dana Docs), buyer `ORG_USER_DEFAULT`. All signed out at the end.
Tools: `measure-layout.ts` snippets (overflow, touch, contrast, occlusion, focus, CLS) + axe-core 4.10.2 (wcag2a/aa, 21a/aa, 22aa; best-practice excluded). Screenshots: `screenshots/4v-*.png`.

## Verdicts
| # | Verdict | Summary |
|---|---|---|
| I1 | **PASS** (invariants) / parity part not verifiable | No horizontal scroll, no clipping, no occlusion at 1920 / 768 / 375 on dashboard, my-customers, customer detail, customer-orders, tasks, documents, buyer sales-reps (7 pages x 3 viewports). Text contrast clean on all except documents (see D1). Advisories A1, A2. |
| I2 | **PASS** | `layout-block` keyboard focus = `2px solid #3b82f6`, offset 2px (`--vc-focus-ring-*`). Host focus ring measured the same way (language button, `:root` vars) = identical values. Ring vs white 3.68:1. KNOWN_DIVERGENCE only in code (outline + vars vs `@include focus-ring`), no visible difference. |
| I3 | **FAIL** (D1, D2) + partial SKIPPED | axe serious/critical: **0** on 6 of 7 pages in default state; **D1** on documents (15 nodes), **D2** in dashboard Edit-layout mode (3 nodes). "Loading page…" is a `status`, atomic, `aria-live=polite` (a11y tree, observed once). Slow notice + Reload page: **SKIPPED** (see below). |
| I4 | **SKIPPED** | No design/prototype link on the ticket. Never a pass. |

## Defects (nothing filed in Jira)
**D1 — Document library meta text fails contrast (WCAG 1.4.3). Severity guess: High (P1).**
Repro: sign in as Advanced rep -> `/company/documents` -> run axe, or measure `.document-card__meta` ("Published Oct 5, 2026 · 12 pages", 12px). Fg `#a3a3a3` on `#ffffff` = **2.52:1** (needs 4.5:1). 15 nodes, all cards, same at 768/375. Evidence: `4v-documents-1920.png` (meta line visibly faint). Plugin-owned class. Neutral-400 used for informational text; host baseline unavailable, so regression vs host is unproven.

**D2 — Dashboard Edit-layout mode: 3 contrast failures (WCAG 1.4.3). Severity guess: Medium–High.**
Repro: rep -> `/company/dashboard` -> Edit layout -> axe `color-contrast`.
- `.layout-edit-bar__keys` ("Keyboard: press space…", 14px): `#737373` on `#ffeff0` = 4.25:1.
- `#dashboard-parked-stats` ("HIDDEN STATS", 12px bold): `#a3a3a3` on `#fafafa` = **2.41:1**.
- pressed "Editing layout" button (12px bold): `#e52121` on `#fad3d3` = 3.35:1.
Evidence: `4v-dashboard-editlayout-focus-1920.png`. Same neutral-400 token pattern as D1.

**D3 — Raw i18n keys flash in the hub sidebar while the plugin loads. Severity guess: Low–Medium.**
Repro (seen once, first sign-in with returnUrl=/company/dashboard, normal network): the a11y tree showed `SALES_REP.HUB.TITLE`, `Sales_rep.hub.dashboard.navigation.link`, `Sales_rep.tasks.title`, `Sales_rep.navigation.link` next to "Loading page…"; a moment later they resolved to "SALES REP HUB / Dashboard / Tasks / Sales reps", and the "My customers" link appeared after the rest (sidebar items pop in). Not reproduced on 4 later loads (race), so timing-dependent. No screenshot (caught in snapshot text only).

## Advisories (not failures)
- **A1 touch targets (BL-UI-006 / 2.5.8), plugin text links <24px high at <=768**: "2 overdue tasks" 14px, task-title buttons on `/company/tasks` 18px, "All orders"/"All tasks" 18px, order-number and product links 20px, customer-order links 20px. Same 17-18px pattern as host links (footer, breadcrumbs), so likely inherited, not new; rows are spaced well apart. No pre-port baseline to confirm. Edit-layout controls are fine (32x32, inputs 56x24).
- **A2 CLS dashboard cold load = 0.088** (PASS < 0.1, borderline; contributors: stat widgets / table skeleton swap / Edit-layout button). One sample.
- **A3 data-failure alerts not announced (WCAG 4.1.3)**: with the network offline, dashboard shows `vc-alert--soft--danger` ("The saved layout could not be loaded…", "filters and sorting options couldn't be loaded") with no `role=alert`/`aria-live`; text contrast fine (#800f0f on #fad6d6). Alert is UI-kit component; confirm against host.
- **A4 drag-only hide (WCAG 2.5.7), needs manual confirmation**: in Edit layout the six stat tiles have only a Reorder handle (no per-tile Hide/✕, unlike the three widgets); hiding a stat is drag-to-"Hidden stats" or keyboard (space + arrows). Widgets have 32x32 Hide buttons.
- Non-text contrast: warning icon on the "Orders in New status" tile `#fc9e00` on white = 2.09:1 (decorative next to text); product-placeholder glyph 2.52:1 (placeholder).
- Incidental (host, out of scope): notification badge "21" wraps to two lines at 375 for the buyer (`4v-sales-reps-375.png`); "Order on behalf / Create quote / Schedule call" tiles on customer detail are disabled (opacity 0.6), exempt.
- axe `incomplete` (manual verification): color-contrast (3-4 nodes/page), `link-in-text-block` (my-customers), `aria-prohibited-attr` (customer detail). Screen-reader output not verifiable with this toolkit.

## SKIPPED / not done (stated, not passed)
- **Slow notice + failed state + Reload page (keyboard reach, contrast, announce)**: not reproducible. Chrome DevTools MCP has no per-URL request blocking, only Slow 3G / Offline. 4 attempts (Slow 3G on cold fresh contexts x2, Slow 3G client-side nav, Offline lazy nav): the plugin always finished loading or the page rendered its own data-error states; the placeholder never showed. Needs a Playwright lane with `route('**/modules/**')` or manual DevTools blocking.
- **Host-vs-plugin parity** (spacing/tokens): no host build to diff on this stand; BL-UI-002 spacing and BL-UI-005 alignment snippets were not run, only screenshot review. Red preset N/A (storefront is Coffee; presets are a Storybook global).
- Dashboard Edit-layout drag by pointer and keyboard-drag outcome (functional) not exercised.
- `/company/my-customers/<org>` tested for AcmeCorp only; Advanced-rep-only pages beyond documents not exercised.

## Screenshots (`screenshots/`)
`4v-dashboard-{1920,768,375}`, `4v-dashboard-editlayout-focus-1920`, `4v-my-customers-{1920,768,375}`, `4v-customer-detail-{1920,768,375}`, `4v-customer-orders-{1920,768,375}`, `4v-tasks-{1920,768,375}`, `4v-documents-{1920,768,375}`, `4v-sales-reps-{1920,768,375}`, `4v-placeholder-offline-1` (dashboard data-error states, not the placeholder).
