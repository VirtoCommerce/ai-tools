# VCST-5518 — Phase B GREEN Verification

**Verdict: GREEN — FIX VERIFIED. 3/3 consecutive, checklist 10/10 PASS, zero regressions.**

Env: vcst-qa storefront @ Platform 3.1055.0, Theme **2.55.0-pr-2422-1c98-1c9861e6** (read live from the page
footer), entry bundle **`index-ByEnEQVD.js`** (not the pre-fix `index-DK7fXvSJ.js`). Fresh browser context,
playwright-chrome, 1920px, en-US/USD. Cart `afdb142a-4b0c-4876-a75b-413a6b720a2e` (same as Phase A).

Applying an invalid coupon while a working coupon is applied **no longer touches the cart at all**. `applyCoupon()`
now validates first and early-returns before any mutation — the shopper keeps their discount.

## Scenario (matched to the Phase A RED baseline)

HP LaserJet Pro 500 Color MFP M570dn (discovered live via `/search?q=printer`), **2 × $999.00 = subTotal
$1,998.00**. Coupon V = `ZUR10` (`discountTotal 50.00`). Coupon X = a fresh nonexistent code per run
(`AGENT-TEST-NOPE-5518-B1/-B2/-B3`) so no cached validation can be reused. No-coupon baseline reproduced
identically: discount 0, tax 399.60, total 2397.60.

## Which fix variant — the strong one

**Observed: no-remove-at-all**, not remove-then-rollback. The entire invalid-apply interaction is **ONE**
GraphQL request:

| # | Op | Result |
|---|---|---|
| 1 | `ValidateCoupon(X)` | `{"data":{"validateCoupon":false}}` |
| — | *(nothing else — no `RemoveCoupon`, no `AddCoupon`)* | terminal after a 3 s idle wait |

Compare Phase A RED: `RemoveCoupon(ZUR10)` → `coupons:[]`, `discountTotal:0` → `ValidateCoupon(X)` → `false` →
no re-add. The `RemoveCoupon` call is now **absent from the wire**, which is the root-cause proof: the mutation
is not issued-and-undone, it is never issued.

## Checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | V remains applied after invalid X, discount intact — **3/3** | **PASS** | B1/B2/B3 all: `coupons:[{ZUR10,isAppliedSuccessfully:true}]`, Discount `- $50.00`, Total `$2,337.60` unchanged |
| 2 | **No `RemoveCoupon` sent at all**; `ValidateCoupon(X)`→`false` first | **PASS** | Single request per run: `b1-155`, `b2-157`, `b3-159` — all `ValidateCoupon`, all `false`. Zero mutations |
| 3 | "This code is not valid" still surfaced | **PASS** | Inline `alert` present all 3 runs — error path not silenced |
| 4 | Valid replacement in the NEW order, no stacking | **PASS** | `ValidateCoupon(FREE)`→`RemoveCoupon(ZUR10)`→`AddCoupon(FREE)` (152→153→154). Final `coupons:[FREE]` only, `discountTotal 299.70` (FREE's only), total 2037.96 |
| 5 | Apply from a **no-coupon** state still works, no `RemoveCoupon` | **PASS** | `ValidateCoupon(ZUR10)`→`AddCoupon(ZUR10)` (150→151), no remove. `discountTotal 50` |
| 6 | Re-apply of the same applied code → no needless mutation | **PASS** | **Zero** network requests. No reachable UI path exists: the preset card flips to "Remove coupon", and the custom-code slot's Apply is disabled whenever the typed code matches a rendered preset card (see note below) |
| 7 | Manual "Remove coupon" works; Discount row persists at $0.00 | **PASS** | `RemoveCoupon(FREE)` → `coupons:[]`, **`discountTotal 0`**, total 2397.60. Discount row still rendered showing `$0.00` (asserted on response `discountTotal`, not row absence) |
| 8 | No new console errors vs RED baseline | **PASS** | See Console below |
| 9 | Storefront UI and `cart.coupons` agree after the failed apply | **PASS** | Independent `GetFullCart` after a page reload: `coupons:[{ZUR10,isAppliedSuccessfully:true}]`, `discounts:[{amount:50,coupon:"ZUR10"}]`, `discountTotal 50` — matches the UI's `- $50.00` / `$2,337.60` |
| 10 | BL-CART-009 single slot · BL-CHK-006 total formula | **PASS** | Exactly one card in the applied state at all times (the failed custom-code slot renders an error, never an applied state). BL-CHK-006 verified on every response: 1998−50+389.60+0=2337.60 ✓; 1998−299.70+339.66+0=2037.96 ✓; 1998−0+399.60+0=2397.60 ✓ |

**3× run tally: 3/3 PASS** — deterministic, no intermittency. Plus a 4th bonus case: invalid code from a
**no-coupon** state also emits only `ValidateCoupon`→`false` with no mutation (`b4-158`).

## Console / network

- **Zero JS exceptions, zero unhandled rejections, zero CSP violations, zero 4xx/5xx on `/graphql`** — every
  POST 200 with no `errors[]` and `validationErrors: []`.
- Only errors are the same pre-existing seed-fixture image failures the RED baseline recorded:
  404s on `AGENT-TEST-CFG-019`, `WH-001`, `PR-001` and `ERR_NAME_NOT_RESOLVED` on `starmarket-platform.demo…`.
  **No new error class.**
- **`[Vue apollo] useQuery() is called outside of an active effect scope`** — **still present**: 5 occurrences
  this session (baseline: 11). The counts are **not comparable** — the baseline session ran 4 full runs plus 4
  preset probes, this one ran fewer coupon interactions; the rate is still ~1 per coupon interaction. So the
  fix neither introduced nor removed it. It remains an unfixed pre-existing lifecycle-scope smell on the same
  `useCoupon` surface. Noted, not filed.

## Factual observation — "Custom code" input is still editable

Requested re-check: **the input is NOT read-only while a coupon is applied** — same as the pre-fix build. With
`ZUR10` applied I typed a new value straight in and its Apply button was enabled, and that typed path is what
drove all three runs. The ticket's note that it is `readonly` remains incorrect on this build.

A related mechanic worth recording (not a defect, and no bug is being filed): the custom-code Apply button is
disabled whenever the typed code **duplicates a rendered preset card**, independent of applied state — `ZUR10`
typed with nothing applied was also disabled. That, plus preset cards flipping to "Remove coupon", is why
item 6 has no reachable UI path.

## Evidence

- `screenshots/VCST-5518-GREEN-B1-coupon-preserved.png` — the money shot: ZUR10 card green/applied with
  Discount **− $50.00** / Total **$2,337.60**, *and* the red "This code is not valid" under Custom code, one frame
- Verbatim GraphQL payloads (no Authorization header captured — nothing to redact) in
  `test-results/chrome/vcst5518-green/`:
  - `b1-150` / `b1-151` — `ValidateCoupon(ZUR10)`:true → `AddCoupon(ZUR10)` (item 5)
  - `b1-155`, `b2-157`, `b3-159` — the three `ValidateCoupon(X)`:false, each the sole request (items 1–3)
  - `b3-after-GetFullCart-response.json` — independent server read (item 9)
  - `repl-152/153/154` — valid-replacement order (item 4); `rm-156` — manual remove (item 7)
  - `b4-158` — bonus no-coupon invalid apply
  - `console-warn-and-error-all.log` — full console capture
- Phase A RED baseline for comparison: `phase-a-baseline.md`

Teardown: cart cleared (verified "Your cart is empty"). No tracker ticket filed, no JIRA comment, nothing pushed.
