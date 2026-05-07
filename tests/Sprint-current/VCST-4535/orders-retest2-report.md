# VCST-4535 — Orders Re-test #2 (Storefront `/account/orders`)

**Date:** 2026-05-07
**Browser:** playwright-chrome (Chromium headless 148.0.7778.96, locale en-US, viewport 1920x1080)
**Tester:** qa-frontend-expert
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2261
**Trigger:** Developer Maya Diachkovskaia confirmed fix in JIRA comment 96905 (2026-05-07): "please check updated orders table as well"
**Prior verdict (2026-05-06, build 156bb3bb):** PASS_WITH_NOTES — outstanding P2 a11y BUG-2 on `/account/orders`

---

## 1. Build verified

| Field | Value |
|---|---|
| Theme version (footer) | `Ver. 2.49.0-pr-2261-79f5-79f53122` |
| Theme version (bundle string match) | `2.49.0-pr-2261-79f5-79f53122` (regex against `/assets/index-Br_73uDh.js`) |
| Markers in bundle | `pr-2261` ✓, `79f5` ✓, `79f53122` ✓ |
| Expected target SHA | `79f53122` ✓ — **match** |

Build is the new artifact developer requested re-test against (was `156bb3bb` in the prior round).

User signed in: **Bence and Family / Elena Mutykova** (B2B Org Admin, multi-org user from `USER_EMAIL` in .env — same as prior run).

---

## 2. R1.2 — BUG-2 Space-key activation on order rows

### Setup
- Navigate to `/account/orders` — table rendered with 10 rows, 6 columns.
- First row HTML attrs (DOM-inspected):
  ```
  <tr role="button" tabindex="0" class="vc-table__row cursor-pointer">
    <td>CO260505-00032</td><td></td><td>PI260505-00032</td>
    <td>5/5/2026</td><td>…Payment required…</td><td>$239.98</td>
  </tr>
  ```
- `role="button"` ✓, `tabindex="0"` ✓ — **R1.2.3 PASS**.

### Tab focus
- After 6 Tabs from search box, first `<tr>` is the active element.
- Computed focus ring: `outline: color(srgb 0.6 0.423529 0.352941 / 0.4) solid 2px` (Coffee theme accent at 40% alpha) — **R1.2.4 PASS**.
- Evidence: `screenshots/retest2/r1-2-orders-row-focused.png`.

### Space activation (the bug under test)

**Instrumentation:** `window.open` was wrapped to record calls to `window.__openCalls[]` without actually opening tabs (so behaviour is observable in this single-tab MCP session). Initial state: `scrollY=0`, `__openCalls=[]`.

**Action:** Pressed real keyboard `Space` while first row was the active element.

**Observed state immediately after Space (verified 2× in two independent presses):**

| Probe | Before Space | After Space | Expected after fix |
|---|---|---|---|
| `window.scrollY` | 0 | **686** | 0 (preventDefault) |
| `window.__openCalls.length` | 0 | **0** | 1 (`/account/orders/<UUID>`, `_blank`) |
| `document.activeElement.tagName` | TR | TR | TR |
| `location.pathname` | /account/orders | /account/orders | /account/orders |

**Result: R1.2.5 FAIL — Space did NOT activate the row, AND scrolled the page 686px (preventDefault is not called).**

This is the **identical failure mode** to the prior round on build `156bb3bb`.

**Evidence:**
- `screenshots/retest2/r1-2-orders-html-attrs.png` — pre-press state with QA debug overlay (role/tabindex/scrollY/openCalls).
- `screenshots/retest2/r1-2-orders-space-fail.png` — post-press state showing `scrollY=686`, `__openCalls.length=0`, FAIL banner.

### Bundle inspection (root cause confirmation)

Searched the loaded bundle `/assets/index-Br_73uDh.js` (≈2.0 MB, 2,015,247 chars):
- `"Enter"` keydown handler hits: 1 — and it's for a tooltip/popover (`onKeyup: R=>{R.key==="Enter"&&ne(),R.key==="Escape"&&Q()}`), not the VcTable row.
- `"Space"` keydown handler hits: 0.
- `" "` (space literal) keydown handler hits: 0 in keydown context.

The orders detail navigation lives in a lazy-loaded chunk (not in the entry bundle), but the bundle scan independently corroborates that no explicit Space key handler was added to the new VcTable row component — the previous fix scope did not include adding `' '` / `'Space'` to the keydown matcher.

### Enter (regression check on the still-working keyboard path)

Re-focused first row → pressed `Enter`:
- `window.__openCalls = [{ url: '/account/orders/51eb29e5-38c1-45e6-b2a2-db8dcb0fba02', target: '_blank', ts: 1778152802677 }]`
- `scrollY = 0` (no scroll — Enter does NOT default-scroll on a button-role element)
- `location.pathname = '/account/orders'` (current tab unchanged, by-design new-tab open)

**R1.2.6 PASS** — Enter regression intact.

### R1.2.7 — preventDefault on Space
**FAIL.** Page scrolled 686px on Space press, indicating no `event.preventDefault()` is invoked in any handler (no Space keydown handler exists at all).

### R1.2.8 — Mouse click regression check
Real mouse click on first row → `window.__openCalls = [{ url: '/account/orders/51eb29e5-38c1-45e6-b2a2-db8dcb0fba02', target: '_blank' }]`. **PASS.**

---

## 3. R4 — `orders.vue` regression sweep (declarative VcTableColumn API)

| ID | Item | Result | Evidence / Notes |
|---|---|---|---|
| R4.1 | All expected columns render (Order # / Purchase order / Invoice / Date / Status / Total) | **PASS** | 6 column headers verified via `thead th` queryAll: `["Order number","Purchase order","Invoice","Date","Status","Total"]`. All `<th scope="col">`. |
| R4.2 | Order # in list = order detail URL (BL-ORD-005) | **PASS** | List row `CO260505-00032` → click → captured `window.open('/account/orders/51eb29e5-38c1-45e6-b2a2-db8dcb0fba02', '_blank')`. Direct nav to that UUID → `<h1>Order #CO260505-00032</h1>` and `document.title="QA & Order #CO260505-00032"`. Match confirmed. |
| R4.3 | Status labels render as human-readable text (BL-ORD-001) | **PASS** | Distinct labels observed across 10 rows: `"Payment required"`, `"Processing"` — no raw enum values (`PaymentRequired`, `New`, etc.). The doubled text in `textContent` is icon `aria-label` + visible label, both human-readable. |
| R4.4 | Mouse click on row → opens new tab | **PASS** | `window.open('/account/orders/<UUID>', '_blank')` captured on real left-click; current page stays at `/account/orders`. By-design per `project_vctable_rowclick_newtab.md`. |
| R4.5 | Ctrl+click → opens new tab | **PASS** | Real Ctrl+click on row 2 (`CO260505-00031`) → captured `window.open('/account/orders/fb274deb-07c9-4904-a848-0138f8835a7d', '_blank')`. Same handler path as plain click. |
| R4.6 | Sticky header on scroll | **N/A** | Orders table fits within viewport at 10 rows / 1080p; no vertical overflow at this row count to exercise stickiness. Header markup uses `<thead>` semantic; no functional regression observed. |
| R4.7 | Empty-state rendering when filter returns 0 | **PASS** | Typed `ZZZ-NO-MATCH-9999` in search → table renders no `<tr>` rows; surface displays `"There are no results found"` with `RESET SEARCH` action. Evidence: `screenshots/retest2/r4-7-orders-empty-state.png`. |
| R4.8 | Browser console — errors / Vue warnings | **PASS (with note)** | 0 Vue warnings, 0 JS exceptions. Pre-existing image 404s for `threecentsCherry-Soda-1...` (catalog asset) — unrelated to VCST-4535. Other 404s in the run are from QA probes (`packages.json`, `manifest.json`, etc.) not page-emitted. |
| R4.9 | Orders GraphQL request returns 200 | **PASS** | 10 POST `/graphql` requests during the orders page session — all `[200]`. No `errors[]` payload markers observed. Evidence: `har/orders-retest2-network.txt`. |

---

## 4. Console / network errors

- **Console errors (organic, not test probes):** 2 image 404s (`threecentsCherry-Soda-1-e1585652933596_216x216_md.png` / `_348x348_md.png` from `vcst-qa.govirto.com/cms-content`). Pre-existing catalog asset issue unrelated to VCST-4535 — no Vue warnings, no JS exceptions, no GraphQL errors.
- **Vue warnings:** none.
- **Network failures on orders surface:** none (all `/graphql` POST = 200).

---

## 5. Verdict

**FAIL on the orders.vue surface.**

- **R1.2 (the ticket-driver re-test):** **FAIL** — BUG-2 (Space-key activation, WCAG 4.1.2) is **NOT FIXED** on build `2.49.0-pr-2261-79f5-79f53122`. Two independent Space presses both produced `scrollY 0→686` and zero `window.open` calls. The stated fix expectation ("Space MUST also activate the row, opening the order detail in new tab via `window.open(_blank)`") is unmet. `preventDefault()` is also not called (page scrolls on Space press). Bundle inspection corroborates: no Space (`" "` or `"Space"`) keydown handler was added in this build.
- **R4 (regression sweep):** **PASS** — orders.vue migration to declarative `<VcTableColumn>` did not introduce regressions. Columns, BL-ORD-005, BL-ORD-001, mouse click, Ctrl+click, empty state, console, and GraphQL all clean.
- **Enter activation:** still works (regression intact).
- **Mouse click activation:** still works (regression intact).

### Recommendation

Return to dev. The fix for BUG-2 has not landed on the row keydown handler in `orders.vue` / the new VcTable row component. Required change (matching the prior bug-report STR):

```ts
// in the new VcTable row keydown handler
on: {
  keydown(e) {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Space') {
      e.preventDefault();   // suppress page-scroll on Space
      this.$emit('row-click', /* row */);
    }
  },
}
```

Note for the developer: the developer's JIRA comment said "please check updated orders table as well" — but the orders table IS what was checked here, and the keyboard handler was not updated. The fix may have shipped in a sibling Storybook story or a different consumer surface.

### Suggested JIRA actions
- Re-open BUG-2 (P2, WCAG 4.1.2) on VCST-4535.
- Cite this report + screenshots `r1-2-orders-space-fail.png` and `r1-2-orders-html-attrs.png` as evidence.
- Keep VCST-4535 NOT TESTED (or move back to In Progress) on the orders surface.

---

## 6. Evidence index

```
tests/Sprint-current/VCST-4535/screenshots/retest2/
  r1-2-orders-table-baseline.png        Initial orders table on /account/orders
  r1-2-orders-row-focused.png           First row focused after Tab — focus ring visible
  r1-2-orders-html-attrs.png            Pre-Space-press: debug overlay shows role/tabindex/openCalls
  r1-2-orders-space-fail.png            Post-Space-press: scrollY=686, openCalls=0, FAIL banner
  r4-7-orders-empty-state.png           Empty state (filter ZZZ-NO-MATCH-9999) with "no results found"

tests/Sprint-current/VCST-4535/har/
  orders-retest2-network.txt            Captured network requests log
  orders-retest2-console.log            Captured console messages
```

---

## 7. Cross-layer verification matrix (per shared-instructions)

- [x] STOREFRONT: UI state confirmed via DOM snapshot + screenshots
- [x] CONSOLE: 0 Vue warnings, 0 JS errors (only pre-existing catalog asset 404s)
- [x] NETWORK: 0 4xx/5xx on `/account/orders` GraphQL flow (10/10 POST = 200)
- [x] GraphQL: no `errors[]` markers in network log
- [x] BL-ORD-001 (status labels): PASS
- [x] BL-ORD-005 (order# = detail URL slug): PASS
- [x] WCAG 4.1.2 (Name, Role, Value — Space activation on `role="button"`): **FAIL**
