# VCST-5016 — QA Verification Report

| Field | Value |
|---|---|
| Ticket | [VCST-5016](https://virtocommerce.atlassian.net/browse/VCST-5016) |
| Summary | [Marketing] [Cart] Coupons sidebar — "View all" link missing `rel="noopener noreferrer"` on `target="_blank"` |
| Type / Priority | Bug / Low (security-hygiene, a11y-related) |
| Sprint | VCST Sprint 26-09 |
| Verification date | 2026-05-12 |
| Verdict | **VERIFIED** |
| JIRA transition | Ready for test → Testing → Tested |
| Linked PR | [vc-frontend#2289](https://github.com/VirtoCommerce/vc-frontend/pull/2289) — `fix(VCST-5016): add rel attribute for link` (OPEN, MERGEABLE) |

## Build Verified

| Component | Version |
|---|---|
| Theme | `vc-theme-b2b-vue-2.49.0-pr-2289-e5ef-e5ef1b1f` (from `vc-deploy-dev/theme/artifact.json @ vcst-qa`) |
| PR build status | deploy-cloud SUCCESS @ 2026-05-12T07:43:41Z |
| CI workflow | Theme CI — `ci` SUCCESS, SonarCloud SUCCESS |
| Environment | https://vcst-qa-storefront.govirto.com |
| Browser | Playwright Chromium via MCP |

## Bug Summary

The `<CouponsSection>` widget on `/cart` renders a `<router-link target="_blank">` to `/account/coupons`. The link previously lacked a `rel` attribute, violating `target="_blank"` security/perf hygiene best-practice (reverse-tabnabbing exposure on older browsers; lint/security audit expectation).

**Source file:** `client-app/shared/cart/components/coupons-section.vue:25`

## PR #2289 Diff

```diff
- <router-link class="coupons-section__link" :to="{ name: ROUTES.PROMOTION_COUPONS.NAME }" target="_blank">
+ <router-link
+   class="coupons-section__link"
+   :to="{ name: ROUTES.PROMOTION_COUPONS.NAME }"
+   target="_blank"
+   rel="noopener noreferrer"
+ >
```

## Verification Checklist

| # | Check | Result |
|---|---|---|
| 1 | Reproduce original bug DOM (rel attribute absent) | N/A — fix already deployed; verified attribute is **now present** instead |
| 2 | Verify fix: `rel="noopener noreferrer"` on `a.coupons-section__link` | **PASS** |
| 3 | Root cause addressed (not just symptom — `target="_blank"` retained) | **PASS** |
| 4 | Coupons section widget renders correctly | **PASS** |
| 5 | Apply Coupon input/Apply button surrounding the link still render | **PASS** (widget container intact) |
| 6 | No new console errors caused by fix | **PASS** (4 pre-existing 404s on a Cherry Soda product image, unrelated) |
| 7 | Storefront DOM reflects corrected behavior | **PASS** |
| 8 | API: N/A (DOM-only fix) | N/A |
| 9 | Boundary: hard reload preserves attribute | **PASS** |
| 10 | Business rule check — `a11y` & `security-hygiene` labels | **PASS** — explicit `rel` attribute is the lint/audit expectation |

## STR — 3 Consecutive Runs

| Run | Method | Result |
|---|---|---|
| 1 | Add 1 item via qty-stepper `+` on PDP → navigate to `/cart` → inspect anchor outerHTML | `rel="noopener noreferrer"` **present** |
| 2 | SPA navigate `/cart → /catalog → /cart` → inspect anchor outerHTML | `rel="noopener noreferrer"` **present** |
| 3 | Hard browser reload of `/cart` (location.reload) → inspect anchor outerHTML | `rel="noopener noreferrer"` **present** |

**STR result: 3/3 PASS — fully deterministic.**

## Captured DOM (Run 1)

```html
<a href="/account/coupons" class="coupons-section__link" target="_blank" rel="noopener noreferrer">
  View all coupons &amp; promotions
  <span class="vc-icon coupons-section__arrow">…arrow svg…</span>
</a>
```

Identical outerHTML in Runs 2 and 3 — see `dom-evidence.html`.

## Side Effects / Regressions

- None observed.
- Coupons widget header "Discount & coupons", icons, and CSS classes intact.
- No new console errors. Console errors observed (4) are pre-existing 404s on `cms-content/assets/catalog/6032b/DRH-42771013/Images/threecentsCherry-Soda-1-…png` (216x216 and 348x348 variants) — unrelated to this fix.

## Out-of-Scope Observation (Follow-up Candidate)

While inspecting all `target="_blank"` anchors on `/cart`, the following links **also lack** a `rel` attribute (same security/hygiene gap as VCST-5016):

| Link text | href | className |
|---|---|---|
| Product title in line items | `/product/{id}` | `vc-product-title__text` |
| About Virto | `https://virtocommerce.com/about-us` | `footer-link` |
| Our partners | `https://virtocommerce.com/our-partners` | `footer-link` |
| Manufacturer partners | `https://virtocommerce.com/solutions/b2b-portal-for-manufacturers` | `footer-link` |
| News | `https://virtocommerce.com/blog/category/news` | `footer-link` |
| Careers | `https://virtocommerce.com/career` | `footer-link` |
| Builder I.O | `https://www.builder.io/` | `footer-link` |
| Vcst-admin | `https://vcst-qa.govirto.com/` | `footer-link` |
| Virto-start | `https://virtostart-demo-store.govirto.com/` | `footer-link` |

Not blocking for VCST-5016. Worth filing a single broader ticket for full-site `target="_blank"` hygiene if leadership decides to pursue it.

## Evidence Artifacts

- `verification-report.md` (this file)
- `verification-summary.json`
- `dom-evidence.html` — captured anchor outerHTML across all 3 runs
- `console-errors.log` — full console-error stream from session
- `screenshots/run1-cart-coupons-section.png` — coupons widget after fresh load
- `screenshots/run3-after-reload-coupons-section.png` — coupons widget after hard reload

## JIRA Trail

- **2026-05-12 10:51** Comment: starting QA verification + build details
- **2026-05-12 10:51** Transition: Ready for test → Testing (`On QA`)
- **2026-05-12 10:55** Transition: Testing → Tested (`Finish test`)
- **2026-05-12 10:55** Comment: QA PASSED summary

Final transition to **Done** intentionally left to dev/PM after PR #2289 merge (per user preference).
