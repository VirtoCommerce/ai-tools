# VCST-5518 — Phase A RED Baseline

**Verdict: RED CONFIRMED — reproduced 4/4 runs, deterministic, zero non-reproductions.**
Env: vcst-qa storefront @ Platform 3.1055.0, Theme **2.55.0-pr-2412-7bfd-7bfde57d** (read live from the page
footer — the pre-fix build; fix ships in pr-2422). playwright-chrome, 1920px, en-US/USD.

Applying an invalid coupon while a working coupon is applied silently drops the working coupon: `applyCoupon()`
sends `RemoveCoupon(current)` **first**, then `ValidateCoupon(new)`, and on `false` returns with **no re-add and
no rollback**. Cart ends `coupons: []`, `discountTotal: 0`. Only feedback is "This code is not valid" — nothing
says the discount is gone.

## Cart shape

HP LaserJet Pro 500 Color MFP M570dn Laser Printer, Copy/Fax/Print/Scan (discovered live via `/search?q=printer`),
**2 × $999.00 = subTotal $1,998.00** (>$1000, so no ≤$1000-exclusive promo interferes). No-coupon baseline:
`discountTotal 0`, tax 399.60, shipping 0, total 2397.60 — BL-CHK-006 holds (1998 − 0 + 399.60 = 2397.60).

## Coupon discovery

The sidebar rendered **4** preset cards; probed individually from a no-coupon state, **all four are VALID** for
this cart, so no preset could serve as coupon X:

| Code | Card label | `validateCoupon` | `discountTotal` |
|---|---|---|---|
| `ZUR10` | 10% OFF cart / "Test ZUR10" | true | **50.00** |
| `agenttestlc062` | 5% off cart | true | 99.90 |
| `winegift` | Gift / "Wine as a gift" | true | 0 (gift-only: adds 2 `gifts[]`) |
| `FREE` | 15% off cart, Expires Jan 1 2027 | true | 299.70 |

- **Coupon V** = `ZUR10`, **D1 = `discountTotal: 50.00`** (runs 1/2/4). Run 3 used **`FREE`** (D1 = 299.70) to prove the defect is not ZUR10-specific.
- **Coupon X** = a **nonexistent code**, `AGENT-TEST-NOPE-5518[-R2/-R3/-R4]` → `{"data":{"validateCoupon":false}}`. Invalid because no such coupon exists in the store; a fresh suffix per run prevents the client reusing a cached validation.
- Observed (not asserted as a rule): `ZUR10` is labelled "10% OFF cart" yet yields $50.00 on $1,998.00 — capped/partial-scope promo.

## Observed sequence (run 4, canonical) — cart `afdb142a-4b0c-4876-a75b-413a6b720a2e`

All HTTP **200**, no GraphQL `errors[]`.

1. `AddCoupon("ZUR10")` → `coupons:[{code:"ZUR10",isAppliedSuccessfully:true}]`, `discounts:[{amount:50,coupon:"ZUR10"}]`, **`discountTotal: 50`**, tax 389.60, total 2337.60
2. *click Apply on invalid X — V is never removed by the user*
3. **`RemoveCoupon(couponCode:"ZUR10")` → 200, `coupons: []`, `discounts: []`, `discountTotal: 0`** ← removed FIRST
4. **`ValidateCoupon(coupon:"AGENT-TEST-NOPE-5518-R4")` → 200, `{"data":{"validateCoupon":false}}`**
5. **NO `AddCoupon` ever sent** — confirmed terminal after a 3 s idle wait; V is never re-added

End state = the no-coupon baseline: `coupons: []`, **`discountTotal: 0`** (D1 of 50.00 lost), tax back to 399.60,
total back to $2,397.60, `validationErrors: []`. The Discount row **persists showing $0.00** (asserted on response
`discountTotal`, not row absence). V's card reverts "Remove coupon" → "Apply coupon ZUR10". Sole message: inline
alert **"This code is not valid"**.

All four runs identical (RemoveCoupon target → ValidateCoupon false → no AddCoupon → end `discountTotal 0`):
run 1 V=ZUR10 (validate served from an earlier cached probe), run 2 V=ZUR10, **run 3 V=FREE (299.70 lost)**, run 4 V=ZUR10.

## Contrast control — valid replacement works

V=`ZUR10` applied, then Apply on **valid** `FREE` with no manual removal:
`RemoveCoupon("ZUR10")` → `coupons:[]` → **`AddCoupon("FREE")`** → `coupons:[{code:"FREE",isAppliedSuccessfully:true}]`,
`discountTotal: 299.70`, tax 339.66, total 2037.96 (BL-CHK-006 ✓). Replacement itself is sound — **only the
invalid path loses the coupon**, confirming a missing-rollback root cause rather than a broken replacement flow.

## Console / network

- **No JS exceptions, no unhandled rejections, no CSP violations, no 4xx/5xx** — every `/graphql` POST 200 with no `errors[]`. **Confirms** the ticket's "no console errors" claim for the defect path.
- Unrelated pre-existing noise: seed-fixture image 404s / `ERR_NAME_NOT_RESOLVED` (`AGENT-TEST-CFG-019`, `WH-001`, `PR-001`, `starmarket-platform.demo…`, `md.all.biz`).
- **Incidental, out of scope but worth flagging to the fix author:** every coupon interaction emits `[Vue apollo] useQuery() is called outside of an active effect scope and the query will not be automatically stopped.` (`vendor-DH0yuoRZ.js:62`) — 11 occurrences this session, same `useCoupon` surface as the fix. Lifecycle-scope smell (leaked query), not an exception. Low severity; noted, not filed.
- **Correction to the ticket's note:** it says the "Custom code" input is `readonly` while a coupon is applied. **On this build it is not** — with `FREE` applied I typed a new value in and its Apply button stayed enabled, and that typed path reproduced the defect (run 3). The shopper-facing typed route is fully exposed, not just the preset cards; both hit the same `applyCoupon()`.

## Evidence

- `screenshots/VCST-5518-RED-A1-coupon-V-applied.png` — V applied: ZUR10 card green/checked, Discount **− $50.00**, Total $2,337.60
- `screenshots/VCST-5518-RED-A2-coupon-lost.png` — broken end state: Discount **$0.00**, Total back to $2,397.60, ZUR10 un-applied
- `screenshots/VCST-5518-RED-A2b-sidebar-coupon-lost-with-message.png` — sidebar-scoped: lost discount **and** the "This code is not valid" message in one frame (preferred for the evidence page)
- Verbatim payloads (no auth headers captured, nothing to redact) in `test-results/chrome/vcst5518/`: `run4-156-request/response.json` (RemoveCoupon), `run4-157-response.json` (ValidateCoupon:false), plus `run2-179/180`, `run3-186/187`, `contrast-183/184` and the four preset probes

Teardown: test cart cleared. No tracker ticket filed, no comment posted, nothing pushed.
