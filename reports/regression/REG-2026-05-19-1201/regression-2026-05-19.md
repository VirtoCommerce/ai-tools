# Regression Test Report — REG-2026-05-19-1201

## Executive Summary

| Field | Value |
|-------|-------|
| Run ID | REG-2026-05-19-1201 |
| Date | 2026-05-19 |
| Environment | vcst-qa |
| Selection | b2c (suites 006–010) |
| Build | vc-theme-b2b-vue 2.49.0-pr-2292-f131d346 / Platform 3.1026.0 |
| Auth Rebind | ORG_USER → Emily Johnson / TechFlow (TestPass123!) |
| Total Suites | 5 |
| Suites Completed | 5 / 5 |
| Total Cases | 160 |
| Passed | 64 |
| Failed | 4 |
| Blocked | 89 |
| Skipped | 3 |
| Overall Pass Rate | 40.0% (incl. blocked) |
| Pass Rate (excl. blocked) | **94.1%** |

---

## Suite Results

| Suite | Name | Browser | Tests | Pass | Fail | Block | Skip | Rate (excl.blocked) | Attempts |
|-------|------|---------|-------|------|------|-------|------|---------------------|---------|
| 006 | B2C Organization | Chrome | 39 | 19 | 1 | 18 | 1 | 95.0% | 1 |
| 007 | B2C Lists & Shared | Firefox | 29 | 14 | 3 | 10 | 2 | 82.4% |1 |
| 008 | B2C Members | Edge | 18 | 11 | 0 | 7 | 0 | 100.0% | 1 |
| 009 | B2C Variations & Configs | Chrome | 31 | 0 | 0 | 31 | 0 | N/A (all blocked) | 1 |
| 010 | B2C Bulk / Ship To / Dashboard | Chrome | 43 | 20 | 0 | 23 | 0 | 100.0% | 1 |
| **TOTAL** | | | **160** | **64** | **4** | **89** | **3** | **94.1%** | |

---

## Bugs Found

| Bug ID | Suite | Severity | Title | Case |
|--------|-------|----------|-------|------|
| BUG-006-01 | 006 | High | Organization invite: invited user email not appearing in members list immediately after invite | B2C-ORG-012 |
| BUG-007-01 | 007 | Critical | Create List button disabled — cannot create new list | B2C-LIST-001 |
| BUG-007-02 | 007 | High | List Settings fields disabled when opened via detail-page LIST SETTINGS button path | B2C-LIST-016 |
| BUG-007-SHARE | 007 | High | No dedicated Share button on list card or list detail page — share URL buried in List Settings dialog | B2C-LIST-019 |
| BUG-009-ENV | 009 | Critical (Env) | All configurable/variation product PDPs return 404 — products not linked to B2B virtual catalog fc596540 (environment data issue, not code defect) | ALL (31 cases) |

---

## Retry Log

| Suite | Attempt | Browser | Outcome | Error |
|-------|---------|---------|---------|-------|
| 007 | 1 | Firefox | Session cleanup required (previous user signed in) | Stale session Elena/Contoso from prior run |
| 008 | 1 | Edge | Session cleanup required (previous user signed in) | Stale session Elena/Contoso from prior run |

No suite required retry beyond initial execution. All 5 suites completed in first attempt.

---

## Blocked Cases Analysis

### Root Cause 1: Configurable/Variation Products 404 (89 cases, 55.6% of all blocks)
All 31 cases in Suite 009 + 18 cases in Suite 006 (configurable product flows) blocked because:
- Products (Configurable Hat, Custom T-shirt, AGENT-TEST bike variants) exist in physical catalog but are NOT linked to B2B virtual catalog root `fc596540864a41bf8ab78734ee7353a3`
- Post-2026-05-15 catalog restore did not re-link virtual catalog entries
- **Action required:** Re-link products to virtual catalog OR reseed configurable products with `/qa-seed-data catalog`

### Root Cause 2: Org User Redirect from /account/addresses (13 cases)
Elena Mutykova in [E2E Test] Contoso Ltd. org context → /account/addresses redirects to /account/dashboard.
- Ship To cases B2C-SHIP-001 through B2C-SHIP-014 (except 007 header) blocked
- **Known behavior:** Address management for org users is via /company/info, not /account/addresses
- **Action required:** Re-run Suite 010 Ship To cases with a personal user account (no org context)

### Root Cause 3: Pagination Not Testable (2 cases)
Only 11 members in TechFlow org — pagination threshold not reached.

### Root Cause 4: Share Feature Missing UI Surface (3 cases)
B2C-LIST-020, 021, 022 blocked because BUG-007-SHARE prevents getting a shareable URL.

---

## Suite Details

### Suite 006 — B2C Organization (Chrome, Elena/Contoso)
- 19 PASS: Org context display, company name in header, org-user login, company info page, quote requests navigation, org dashboard, sidebar sections, company members link
- 1 FAIL: BUG-006-01 (invite flow — invited user not appearing immediately in members list)
- 18 BLOCKED: All configurable product flows, configurable product add-to-cart tests
- 1 SKIPPED: Mobile responsive test (desktop viewport)

### Suite 007 — B2C Lists & Shared (Firefox, Elena/mutykovaelena@gmail.com)
- 14 PASS: Add to List from PDP/category, view list, add all to cart, remove item, rename/delete list, pagination, empty state, qty update, privacy settings, sidebar nav, count badge, saved-for-later, lists header nav
- 3 FAIL: BUG-007-01 (create button disabled), BUG-007-02 (settings fields disabled via detail path), BUG-007-SHARE (no Share button)
- 10 BLOCKED: Share-dependent flows, configurable product in list, org visibility, out-of-stock state
- 2 SKIPPED: Per-item add-to-cart (by design: B2B has no per-item button), mobile layout

### Suite 008 — B2C Members (Edge, Emily/TechFlow)
- 11 PASS: Members list loads, search by name/email, view roles, invite flow, invite validation, edit role, active Actions dropdown (Edit/Block/Delete/Login on behalf), blocked Actions dropdown (Edit/Unblock/Delete/Login on behalf), status badges, login on behalf option, role filter, status filter, invited status
- 0 FAIL
- 7 BLOCKED: Pagination (only 11 members), Block user action (permission issue for Org Maintainer role), Unblock (depends on block), Delete (destructive — skipped), mobile layout

### Suite 009 — B2C Variations & Configs (Chrome, Elena)
- 0 PASS / 0 FAIL
- 31 BLOCKED: All variation/configurable product PDPs return 404 post-catalog-wipe (BUG-009-ENV environment issue)

### Suite 010 — B2C Bulk / Ship To / Dashboard (Chrome, Elena/Contoso)
- 20 PASS: Ship To header selector (007), Bulk Order Copy&Paste tab, Manually tab row entry, Add 5 more rows, invalid SKU error modal, Add to cart with valid SKU (ALCOE1931 added qty=2, cart 12→14), quantity validation, tab switching; Dashboard loads, recent orders widget (4 orders), monthly spend ($58k/$530k), orders status widget, sidebar navigation, notifications page, show unread toggle, notification bell, mark all read, saved-for-later with items, back-in-stock empty state, points history (balance 20, 4 earned entries), coupons page (THRESH50/FIXED5 coupons), copy link UI, expiry dates
- 0 FAIL
- 23 BLOCKED: Ship To address CRUD cases (org user redirect for /account/addresses), back-in-stock subscribe flow (no OOS product), back-in-stock notification received

---

## Quality Gate Assessment — Sprint Release Gate

| Criterion | Threshold | Measured | Status |
|-----------|-----------|---------|--------|
| Critical path pass rate (P0+P1, excl. blocked) | >=95% | 94.1% | NEAR-MISS (-0.9%) |
| Open P0 bugs (code defects) | 0 | 1 (BUG-007-01 Create List disabled — Critical) | FAIL |
| Open P1 bugs | 0 (all resolved/deferred) | 3 (BUG-006-01, BUG-007-02, BUG-007-SHARE) | REQUIRES ASSESSMENT |
| Regression suite pass rate | >=90% | 94.1% (excl. blocked) | PASS |
| Security vulnerabilities | 0 | Not tested in this run (suites 044 not in b2c selection) | N/A |

**Note on BUG-007-01 (Create List disabled):** This is a Critical-severity functional defect — the core List creation flow is broken for all users. This is a P0 code defect for B2C list functionality.

**Note on BUG-009-ENV:** This is an environment data issue (missing virtual catalog link), not a code defect. Does not count against the gate.

### Verdict: BLOCKED

**BUG-007-01 (Create List button disabled — Critical)** is an open P0 bug. Per Sprint Release Gate policy, a P0 bug blocks deployment regardless of pass rate. Additionally, pass rate of 94.1% falls 0.9% short of the 95% threshold.

**Conditions to unblock:**
1. Fix BUG-007-01 (Create List button disabled) and re-verify
2. Investigate and resolve or defer BUG-007-02 and BUG-007-SHARE with documented risk acceptance
3. Re-link configurable/variation products to B2B virtual catalog (BUG-009-ENV) and re-run Suite 009 to recover blocked tests
4. Re-run Ship To cases (B2C-SHIP-001 to 014) with a personal user account (no org context) to improve Suite 010 coverage

---

## Environment & Infrastructure Notes

- Storefront version: 2.49.0-pr-2292-f131d346 (stable throughout run)
- No environment downtime or 5xx errors observed during execution
- Cart state inherited between test sessions (cart had 12 items at Suite 010 start; bulk order test added 2 more)
- /account/loyalty returns 404; correct URL is /account/points-history
- Firefox required stale session cleanup before Suite 007 execution
- Edge required stale session cleanup before Suite 008 execution
