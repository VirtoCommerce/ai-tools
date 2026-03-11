# VCST-4590 Coupons & Promotions Page -- Frontend Test Execution Report

**Date:** 2026-03-11
**Tester:** QA Frontend Expert (Claude Opus 4.6)
**Browser:** Chromium (playwright-chrome)
**Environment:** QA (https://vcst-qa-storefront.govirto.com)
**Store:** B2B-store
**User:** mutykovaelena@gmail.com (ACME Store 3 / Elena Mutykova)
**Storefront Version:** 2.44.0-pr-2198-6327-6327c148

---

## Summary

| Metric            | Count |
|-------------------|-------|
| Total Assigned    | 18    |
| Executed          | 2     |
| PASS              | 2     |
| FAIL              | 0     |
| BLOCKED           | 16    |
| SKIPPED           | 0     |
| Bugs Found        | 0     |

**Verdict: BLOCKED -- QA environment outage (Cloudflare DNS Error 1016 / DNS_PROBE_FINISHED_NXDOMAIN)**

The QA storefront environment (`vcst-qa-storefront.govirto.com`) went completely unreachable during test execution. The first two test cases (CPN-001, CPN-002) were executed successfully before the outage. After clearing browser state for CPN-002, the `/connect/token` endpoint began failing with HTTP 530, followed by a complete DNS resolution failure (Cloudflare Error 1016). The environment remained down for over 10 minutes with no recovery. All remaining 16 test cases are marked BLOCKED pending environment restoration.

---

## Environment Incident

- **First sign of trouble:** 14:09:45 UTC -- `/connect/token` returned HTTP 530 during sign-in attempt
- **Full outage:** 14:10:34 UTC -- Cloudflare Error 1016 (Origin DNS error)
- **Last check:** ~14:22 UTC -- `DNS_PROBE_FINISHED_NXDOMAIN` persists
- **Cloudflare Ray IDs:** 9dab24b57dc7c1f9, 9dab2544ca46c1f9, 9dab260f9cd5c1f9
- **Impact:** Complete storefront unavailability; no pages load, no GraphQL, no auth

---

## Test Case Results

### CPN-001: Coupons page authenticated access and page load
- **Priority:** Critical
- **Status:** PASS
- **Evidence:** `CPN-001-coupons-page-loaded.png`
- **Steps Executed:**
  1. [NAV] Navigated to /en-GB/account/dashboard -- dashboard loaded with sidebar visible
  2. [ASSERT] "Marketing" section visible in sidebar
  3. [ACT] Clicked "Coupons & promotions" link in sidebar
  4. [WAIT] URL changed to /en-GB/account/coupons
  5. [WAIT] Page heading visible
- **Assertions Verified:**
  - [DOM] Page heading reads "ALL COUPONS & PROMOTIONS" -- PASS
  - [DOM] Sidebar link "Coupons & promotions" is highlighted/active (styled differently from other links) -- PASS
  - [DOM] At least one coupon card visible (15 cards rendered) -- PASS
  - [NAV] URL is /en-GB/account/coupons -- PASS
  - [FORMAT] Page renders without layout breaks -- PASS
- **Cross-Layer Checks:**
  - [API] POST /graphql returned HTTP 200 (multiple calls) -- PASS
  - [CONSOLE] Zero JS errors during page load -- PASS
  - [NETWORK] No 4xx/5xx on /graphql -- PASS
- **Notes:** 15 coupon cards displayed. Coupons observed: SUPER, QA, FIXED5, FREESHIP, WINE, AGENT, AIR, THRESH50, E2E-COUPON, CAT20, QA10OFF, EXCLUSIVE10, QA (duplicate code on "QA COUPON TOP"), SUPER (duplicate code on "Test 100%"), WINE (duplicate code on "Wine as a gift"). Some coupons share the same code (SUPER appears twice, QA appears twice, WINE appears twice) -- this may be intentional or a data quality issue worth noting.

---

### CPN-002: Unauthenticated access redirects to sign-in
- **Priority:** Critical
- **Status:** PASS
- **Evidence:** `CPN-002-redirect-to-signin.png`
- **Steps Executed:**
  1. [ACT] Cleared cookies, localStorage, and sessionStorage to simulate unauthenticated state
  2. [NAV] Navigated directly to /en-GB/account/coupons
  3. [WAIT] Page redirected
- **Assertions Verified:**
  - [NAV] Redirected to /en-GB/sign-in?returnUrl=/account/coupons -- PASS
  - [DOM] Sign-in form is displayed with email and password fields -- PASS
  - [DOM] returnUrl parameter preserves /account/coupons for post-login redirect -- PASS
  - [DOM] No account sidebar visible (unauthenticated) -- PASS
- **Cross-Layer Checks:**
  - [CONSOLE] No JS errors during redirect -- PASS
- **Notes:** Clean redirect with returnUrl preserved. Sign-in page renders correctly with Email, Password fields, Remember me checkbox, and social sign-in options (Entra ID, Google).

---

### CPN-003: Coupon card -- all fields displayed correctly
- **Priority:** High
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** Partial data collected during CPN-001 execution. From the snapshot, coupon cards display: promotion name (paragraph), subtitle (paragraph), description text (paragraph), expiration date ("Expires / Jan 1, 2027"), and coupon code button with "Click to copy" label. Full visual validation and field-by-field assertion could not be completed due to inability to re-authenticate after environment went down.

---

### CPN-004: Coupon code -- click to copy copies to clipboard
- **Priority:** Critical
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)

---

### CPN-005: Copied coupon code -- apply to cart E2E
- **Priority:** Critical
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)

---

### CPN-006: Multiple coupons -- each card has functional copy button
- **Priority:** High
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)

---

### CPN-007: Coupon with no detail text -- card renders without empty space
- **Priority:** Medium
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** From CPN-001 snapshot, "QA COUPON TOP" card has description "top 20 $" and "Test 100%" card has an empty paragraph element for description. This may be a candidate for CPN-007 validation once environment is restored.

---

### CPN-008: Sidebar navigation -- active state highlighted
- **Priority:** High
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** From CPN-001 screenshot, "Coupons & promotions" link in sidebar appears visually distinct (highlighted with darker background) compared to other sidebar links. Visual confirmation was captured in CPN-001 screenshot but full assertion (CSS class verification, contrast check) could not be completed.

---

### CPN-009: Shipping discount coupon card -- detail text shows info
- **Priority:** Medium
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** From CPN-001 data, "QA Free Shipping" card shows description "Free shipping -- $999 off shipping cost" and "Coupon on discount for shipping" card shows its name as description text. These appear to be shipping-related coupons that would satisfy this test case.

---

### CPN-010: Direct URL access loads correctly
- **Priority:** Medium
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)

---

### CPN-011: Copy notification -- manual close works
- **Priority:** Medium
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)

---

### CPN-012: GraphQL data fetch uses correct store context
- **Priority:** High
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** During CPN-001 execution, multiple POST /graphql requests returned HTTP 200. Full GraphQL request/response inspection for store context header could not be performed.

---

### CPN-013: Zero JS console errors during load and copy
- **Priority:** High
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** During CPN-001 execution, zero console errors were recorded during page load. The "copy" interaction could not be tested.

---

### CPN-014: Expired coupon not displayed
- **Priority:** High
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** From CPN-001 data, all visible coupons show "Expires Jan 1, 2027" (future date). Some coupons ("QA COUPON TOP", "Test 100%", "Wine as a gift") have no expiration date displayed. No expired coupons were observed, which is the expected behavior, but Admin verification could not be completed.

---

### CPN-015: Coupon code case preserved -- no mutation
- **Priority:** Medium
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** From CPN-001 snapshot, coupon codes displayed: SUPER, QA, FIXED5, FREESHIP, WINE, AGENT, AIR, THRESH50, E2E-COUPON, CAT20, QA10OFF, EXCLUSIVE10. All appear uppercase. Case preservation from Admin config could not be verified.

---

### CPN-016: Empty state graceful handling
- **Priority:** Low
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** Requires a user account with no assigned coupons. Could not set up test data or test.

---

### CPN-017: Localized URL accessible under locale prefix
- **Priority:** Low
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)
- **Notes:** CPN-001 already confirmed that /en-GB/account/coupons works under the en-GB locale prefix. Testing other locale prefixes could not be completed.

---

### CPN-018: Back navigation returns to dashboard
- **Priority:** Low
- **Status:** BLOCKED
- **Reason:** QA environment outage (DNS_PROBE_FINISHED_NXDOMAIN)

---

## Observations from Executed Tests

### Coupon Data Quality Observations (from CPN-001)
1. **Duplicate coupon codes:** The code "SUPER" appears on two different coupons ("Super Discount" and "Test 100%"), "QA" appears on two ("Simple QA Coupon" and "QA COUPON TOP"), and "WINE" appears on two ("Wine Discount" and "Wine as a gift"). This may cause user confusion but could be intentional test data.
2. **Missing expiration dates:** Three coupons ("QA COUPON TOP", "Test 100%", "Wine as a gift") do not display an expiration date section, while all others show "Expires Jan 1, 2027".
3. **Empty description:** "Test 100%" card appears to have an empty paragraph for its description field -- relevant to CPN-007 testing.
4. **Card count:** 15 coupon cards displayed on the page.

### Infrastructure Incident
- The QA environment experienced a complete outage starting at approximately 14:09 UTC on 2026-03-11.
- Initial symptom: `/connect/token` endpoint returning HTTP 530.
- Progressed to: Cloudflare Error 1016 (Origin DNS error).
- Final state: `DNS_PROBE_FINISHED_NXDOMAIN` -- domain not resolving at all.
- Duration at time of report: 10+ minutes with no recovery.
- This is a P0 infrastructure issue that blocks all frontend testing.

---

## Recommendations

1. **Re-execute after environment recovery:** 16 test cases (CPN-003 through CPN-018) need full execution once the QA environment is restored.
2. **Investigate duplicate coupon codes:** Verify whether SUPER, QA, and WINE appearing on multiple promotions is intentional test data or a configuration issue.
3. **Infrastructure monitoring:** The Cloudflare DNS outage should be investigated -- check if a deployment or DNS configuration change triggered the failure.
4. **Priority for re-test:** CPN-004 (copy to clipboard) and CPN-005 (E2E cart apply) are Critical priority and should be tested first after recovery.

---

## Screenshots

| File | Description |
|------|-------------|
| `CPN-001-coupons-page-loaded.png` | Coupons page with 15 coupon cards, sidebar active state |
| `CPN-002-redirect-to-signin.png` | Unauthenticated redirect to sign-in with returnUrl |

---

*Report generated: 2026-03-11T14:22:00Z*
*Agent: qa-frontend-expert (Claude Opus 4.6)*
*Environment status at report time: DOWN (DNS_PROBE_FINISHED_NXDOMAIN)*
