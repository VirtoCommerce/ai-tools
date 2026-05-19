# VCST-4205 — QA Summary

**Ticket:** [VCST-4205](https://virtocommerce.atlassian.net/browse/VCST-4205) — Bug | Medium | Ready for test
**Parent:** [VCST-2099 Configurable Products](https://virtocommerce.atlassian.net/browse/VCST-2099)
**Date:** 2026-05-19
**Environment:** `vcst-qa` (FRONT_URL=https://vcst-qa-storefront.govirto.com, BACK_URL=https://vcst-qa.govirto.com)
**Build under test:**
- Backend: `VirtoCommerce.XCart 3.1014.0-pr-118-1be7` (vc-module-x-cart PR #118)
- Frontend: `vc-theme-b2b-vue-2.49.0-pr-2294-6509-650937ca` (vc-frontend PR #2294)
- Platform: `3.1026.0`
- Both artifacts confirmed in `VirtoCommerce/vc-deploy-dev@vcst-qa` manifests.

---

## Overall Verdict: **PASS WITH NOTES + OPEN ADJACENT BUGS**

The VCST-4205 fix itself (the three reproducer cases) is verified at the API layer on an isolated user and qualitatively on Firefox. The single Chrome FAIL on Case 2 is confounded by cross-agent cart-state contamination (all three agents were signed into the same storefront user — flagged as a process issue). Two clear, independently reproducible adjacent UI bugs were uncovered in the saved-for-later widget on `/cart` and should be filed as separate tickets — they are in scope of the same fix area but were not addressed by PR #2294.

---

## Agent Results Matrix

| Layer | Agent | Browser | User | Verdict | Source |
|---|---|---|---|---|---|
| Backend xAPI | `qa-backend-expert` | n/a (canonical runner) | `user-acme-store-maintainer-1` (isolated) | **PASS** (3 of 4 cases — CASE6 was an authoring mismatch, not a code defect) | `backend-execution-report.md` |
| Storefront | `qa-frontend-expert` | playwright-chrome | `mutykovaelena@gmail.com` (shared) | **FAIL** (Case 2 + price-consistency), 6 anomalies logged | `frontend-execution-report.md` |
| Cross-browser + exploratory | `qa-testing-expert` | playwright-firefox | `mutykovaelena@gmail.com` (shared) | **PASS** for Cases 1-3 qualitatively; 11 exploratory findings | `exploratory-session.md` |

## Three Reproducer Cases — Reconciled Verdict

| # | Description | Backend xAPI | Frontend (Chrome) | Cross-browser (Firefox) | Reconciled |
|---|---|---|---|---|---|
| 1 | Different configs of same configurable product stay separate in Save-for-Later | PASS (21/21) | PASS | PASS | **PASS** |
| 2 | Move to Cart from SFL preserves configuration | PASS (7/7 on isolated user) | FAIL (config mutated post-move) | PASS qualitatively | **PASS at API; UI FAIL likely contamination — re-test needed** |
| 3 | Edit Configuration via cart persists new config | PASS (7/7) | PASS (incl. hard reload) | PASS | **PASS** |

## Business-Rule Verification

| BL ID | Scope | Verdict | Evidence |
|---|---|---|---|
| BL-CART-007 | Same SKU + different config → separate lineItems | PASS | Backend CASE1 + frontend `case1-getfullcart-after-2adds.json` |
| BL-CART-010 | Configurable `listPrice` = sum of `selectedForCheckout` placements | PASS at xAPI; storefront DISPLAY violation (A1) | Backend evidence + frontend report §3 |
| BL-CART-014 | `(sectionId, type)` for Text/File; `option.productId` for Variation | PASS | Backend CASE3 mutation responses |
| BL-PRICE-001 | Price math end-to-end | PASS at API; UI display drift (A1) | Frontend report §3 |
| BL-CART-003 | Cart + SFL persist across navigation | PASS | All agents |

## Confirmed Adjacent Bugs (file as new tickets)

### NEW-BUG-1 — Save-for-Later miniwidget on /cart shows base price ($16) instead of `lineItem.listPrice` ($33)

- **Confirmed by:** Chrome (Anomaly A1) AND Firefox (Finding #1) — two independent observations, same root cause.
- **Severity:** P1 / Medium (user-visible pricing inconsistency in high-traffic flow).
- **Root cause hypothesis:** `SavedForLaterSidebar.vue` (or equivalent) binds `product.price.actual` instead of `lineItem.salePrice` / `lineItem.listPrice`. The dedicated `/account/saved-for-later` page and `/account/lists/{id}` page bind correctly — those templates are the reference for the fix.
- **Evidence:**
  - `evidence/case1-cart-with-3sfl.png` (3 hats all show $16 in cart sidebar widget)
  - `evidence/case1-saved-for-later-page.png` (same data shows correct $33/$30/$33 on dedicated page)
  - Firefox: `vcst-4205-ff-04-cart-corrupted-by-parallel-agents.png` vs `vcst-4205-ff-07-saved-account-page-correct-prices.png`

### NEW-BUG-2 — Saved-for-Later entries show master-variation properties instead of `configurationItems[]`

- **Confirmed by:** Chrome (Anomaly A2).
- **Severity:** P1 / High (user cannot distinguish multiple saved configurations of the same configurable product).
- **Root cause hypothesis:** `GetWishlist` / `GetSavedForLater` GraphQL fragments do NOT request `configurationItems` on the line item — only `product.properties[]` from the master variation. Fix is GraphQL fragment selection.
- **Evidence:** `evidence/case4-wishlist-after-save-39.json` — wishlist response has no `configurationItems` field.

### NEW-BUG-3 — `moveToSavedForLater` / `moveFromSavedForLater` behave as bulk operations regardless of `lineItemIds` payload

- **Confirmed by:** Chrome (Anomaly A3).
- **Severity:** P1 / High (per-line buttons move all selected items, defeating the UX intent).
- **Root cause hypothesis:** Backend may be using `selectedForCheckout` semantics instead of the passed `lineItemIds` array. Worth checking xCart PR #118 diff for the move-mutation handler.
- **Evidence:** `evidence/case1-moveToSavedForLater-first-response.json` — payload `lineItemIds: [single-id]` but cart cleared both lines and SFL gained 2 entries.

## Outstanding/Risk

### Case 2 — Chrome FAIL needs isolated re-test

- Chrome saw `f0287f34` lineItem id preserved across `moveFromSavedForLater` but its `configurationItems[]` content swap from `[Green, P print]` (sync response) to `[Red hat, NY print]` (post-render DOM).
- The Red/NY pair matches Config C used elsewhere in the session, so cross-agent (or cross-session in the same user) contamination is the most plausible explanation.
- Backend isolated-user run on the same xCart build was clean (7/7 asserts).
- **Recommendation:** re-run only Case 2 on Chrome with the storefront user assigned from `test-data/users/agent-user-pool.csv` (slot 1) to break contamination. If it still fails, it's a real Apollo-cache / async-settle bug worthy of a follow-up ticket.

### Process gap — parallel agents shared one storefront user

- All three QA agents authenticated as `mutykovaelena@gmail.com` simultaneously, mutating one server-side cart in lockstep.
- Firefox agent directly observed phantom items appearing in their cart (`Black hat + H print` they never selected).
- **Fix:** orchestrator dispatch logic must assign per-slot users (`qa-agent-slot1/2/3@virtocommerce.com` per `test-data/users/agent-user-pool.csv`) when agents run in parallel against cart-mutating flows. This recurring methodology gap could silently invalidate multi-agent regression results elsewhere.

### Error-handling probe — NOT EXECUTED

- The "disable inventory then attempt Move to Cart" probe was deferred — backend agent's session died on the socket error before Admin SPA coordination, and the re-dispatched backend ran only the GraphQL CSV.
- **Recommendation:** schedule as a separate small follow-up if the orchestrator wants ECL-14.1 (`errors[]` swallowing) coverage on this build.

### Adjacent regression — NOT EXECUTED

- CART-012/013 (non-configurable Save-for-Later — suite 029) and CFG-EDIT-001/002/003 (Edit Configuration — suite 072) were deferred by the Chrome agent due to session contamination and time budget. Case 3 of this run gives a positive signal on the Edit Configuration codepath, but a dedicated regression run is the conservative move.

## Test-Data Notes

- Configurable Hat URL drifted from `/configurable-caps-shirts/configurable-hat` to `/configurable-products/configurable-hat` after the 2026-05-15 catalog restore (memory `project_vcstqa_restore_2026_05_15`). Hat now has only **2 Product sections** (Color, Print) — no Text or File sections. Checklist needs updating; BL invariants were still testable.
- The B2B virtual catalog root remains `fc596540864a41bf8ab78734ee7353a3`.

## Build / Deployment

| Artifact | Version on vcst-qa | Source |
|---|---|---|
| Platform | `3.1026.0` | `vc-deploy-dev/vcst-qa/backend/packages.json` |
| vc-module-x-cart | `3.1014.0-pr-118-1be7` (PR #118) | same |
| vc-theme-b2b-vue | `2.49.0-pr-2294-6509-650937ca` (PR #2294) | `vc-deploy-dev/vcst-qa/theme/artifact.json` |

Both PR artifacts deployed and serving on vcst-qa at the time of test (footer + module endpoint confirmation).

## Artifacts Index

```
tests/Sprint-current/VCST-4205/
├── testing-checklist.md                       # Step 3 deliverable
├── frontend-execution-report.md               # Chrome / qa-frontend-expert
├── backend-execution-report.md                # Edge / qa-backend-expert (runner)
├── (exploratory findings consolidated in this summary; Firefox HARs in test-results/firefox/)
├── qa-summary.md                              # this file
├── summary.json                               # machine-readable summary
└── evidence/
    ├── backend/                               # GraphQL runner CSV + 4 evidence JSONs (also in reports/regression/graphql-evidence/)
    │   ├── vcst-4205-cases.csv                # 357 rows runner-native
    │   ├── discover-hat.csv, discover-ring.csv, discover-tshirt.csv
    │   └── (per-case JSON evidence in reports/regression/graphql-evidence/VCST-4205-CASE*.json)
    ├── case1-*.{png,json}                     # merge prevention
    ├── case2-FAIL-config-changed-after-move.png   # Chrome Case 2 evidence
    ├── case2-*.{png,json}
    ├── case3-*.{png,json}                     # Edit Configuration
    ├── case4-*.{png,json}                     # price-consistency
    ├── snapshot-*.yml, console-errors-full-session.log, network-graphql-requests.log
    └── exploratory/                           # Firefox findings reference test-results/firefox/*.png
```

## Recommendations to Orchestrator

1. **Do NOT auto-transition VCST-4205 yet.** The fix is API-clean and qualitatively passing, but Chrome's Case 2 FAIL needs an isolated re-test before signoff.
2. **File 3 new bugs** (NEW-BUG-1/2/3 above) — they are real, reproducible, and independent of the VCST-4205 fix scope.
3. **Run Case 2 on Chrome with per-slot user from `agent-user-pool.csv`** to disambiguate contamination vs. real defect (~10 min).
4. **Add a regression rule to dispatch logic:** parallel agents must use distinct storefront users from `test-data/users/agent-user-pool.csv` when the test flow mutates server-side cart state.
5. **Optional follow-ups:** run the error-handling probe (ECL-14.1) and the deferred adjacent suites (029/072) once Case 2 is resolved.
