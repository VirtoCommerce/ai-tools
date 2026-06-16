# VCST-5162 Testing Checklist — Authorize.Net AllowCartPayment

**Ticket:** VCST-5162 (Story, High, Sprint 26-11)
**Build:**
- Platform: 3.1032.0
- Module: vc-module-authorize-net 3.1001.0-pr-12-c821
- Theme: vc-frontend PR#2309 head ba0bcf37 (deployed to vcst-qa 2026-06-05)
**Env:** vcst-qa | `{{FRONT_URL}}` / `{{BACK_URL}}`

---

## 1. AC → Test Case Mapping

| AC | Description | Case IDs | Layer | Priority |
|----|-------------|----------|-------|----------|
| AC-1 | Authorize.Net module extended with AllowCartPayment=true | CART-PAY-GQL-004 | GraphQL xAPI | Critical |
| AC-1 | AllowCartPayment field exposed via availablePaymentMethods | CART-PAY-GQL-004 | GraphQL xAPI | Critical |
| AC-2 | Accept.js CC form renders inline on /cart (no redirect) | PAY-AN-010 | Storefront UI | Critical |
| AC-2 | Successful cart-embedded payment reaches order confirmation | PAY-AN-014 | Storefront E2E | Critical |
| AC-2 | Method-switch guard: AN→Manual does not charge card | PAY-AN-011 | Storefront UI | Critical |
| AC-2 | Invalid card rejected client-side by Accept.js | PAY-AN-012 | Storefront UI | High |
| AC-2 | Empty required fields block submission | PAY-AN-013 | Storefront UI | High |
| AC-2 | Accept.js script-load failure does not strand user | PAY-AN-015 | Storefront UI | High |
| AC-2 | GA4 purchase event fires exactly once | PAY-AN-016 | Storefront/GA4 | High |
| AC-2 | Multistep checkout: card state survives unmount | PAY-AN-017 | Storefront E2E | Critical |

---

## 2. Execution Checklist

### qa-frontend-expert — browser: playwright-chrome

> Re-run flags: PAY-AN-010/014/016 were VERIFIED on old build ee2627ef; confirm on ba0bcf37.
> PAY-AN-011/012 MUST be re-run on ba0bcf37 (011 tests a useCheckout.ts guard only in ba0bcf37;
> 012 had a deviation on old build — no inline Luhn error, fallback redirect to /checkout/payment).

| Case | Objective | Re-run flag |
|------|-----------|-------------|
| PAY-AN-010 | Accept.js form renders inline on /cart; URL stays /cart; Place Order present but disabled on empty fields | VERIFY on ba0bcf37 |
| PAY-AN-011 | Switching AN→Manual unmounts form; Place Order with Manual method does NOT trigger AN charge | MANDATORY re-run (ba0bcf37 guard) |
| PAY-AN-012 | Luhn-invalid card shows inline error; Place Order stays disabled; clears on valid card entry | MANDATORY re-run (012 failed on ee2627ef — stale build) |
| PAY-AN-013 | Empty/partial card fields block submission; all fields must be filled before Place Order enables | Standard |
| PAY-AN-014 | Full happy-path: fill valid AN card → Place Order → confirmation page → order in /account/orders | VERIFY on ba0bcf37 |
| PAY-AN-015 | Block js.authorize.net via DevTools → error state shown, not blank/broken; unblock → form recovers | Standard |
| PAY-AN-016 | Exactly ONE GA4 purchase event fired; no double-fire from payment component | VERIFY on ba0bcf37 |
| PAY-AN-017 | Multistep: card filled on Billing step → unmounts on Review step → Place Order on Review → order created paid (not Payment Required) | Run only if checkout_multistep_enabled=true; else BLOCKED |

**Pre-run note for PAY-AN-014/016/017:** AN sandbox enforces ~3-min duplicate-transaction window for same-amount retries. Stagger runs or vary cart items between executions.

---

### qa-backend-expert — browser: playwright-edge / graphql-runner

| Item | Objective | Command / Method |
|------|-----------|-----------------|
| CART-PAY-GQL-004 | `cart.availablePaymentMethods` returns `AuthorizeNetPaymentMethod` with `allowCartPayment=true` | `npx tsx scripts/graphql-runner.ts --case regression/suites/Backend/graphql/050c-graphql-xorder.csv:CART-PAY-GQL-004` |
| ORD-018 admin check | Confirm Admin order detail shows `PaymentGatewayTransaction` shape correctly for AN order created in PAY-AN-014 (PR#12 transaction shape) | Open Admin → Orders → find test order from PAY-AN-014 → inspect Payment tab → verify transaction record exists with AN gateway code |
| availablePaymentMethods probe | Verify `allowCartPayment` field present in xAPI schema for AN method (covers AC-1 at API layer) | Covered by CART-PAY-GQL-004 runner execution |

---

## 3. BL Invariants to Verify

> Note: The test cases reference `BL-PAY-001` and `BL-PAY-004` — these IDs do not exist in
> `business-logic.md` (no BL-PAY domain). The applicable real invariants are below.

| BL ID | Severity | One-line rule |
|-------|----------|---------------|
| BL-CHK-004 | P0-revenue | After payment decline the user can retry with a different card without losing cart or shipping selections; no partial/ghost orders on failure |
| BL-CHK-002 | P0-revenue | Double-clicking Place Order must NOT create two orders; button disabled after first click (idempotency) |
| BL-ORD-001 | P0-revenue | Payment state machine: Pending→Authorized→Captured; cannot capture without auth; illegal transitions rejected |
| BL-ORD-006 | P0-revenue | Detailed payment state machine: Authorized→Voided/Captured; no skip from Pending→Captured |
| BL-CROSS-010 | P0-revenue | All checkout mutations idempotent: same cart token → same order; no duplicate charges/orders on retry |
| BL-CROSS-005 | P0-revenue | Order placement side effects: inventory decremented, email sent, GA4 `purchase` fired, cart cleared |

**ECL references used in cases:**
- ECL-14.6: Authorize.Net form renders on /cart with AllowCartPayment=true (not redirect to /checkout/payment)
- ECL-7.1: Method-switch / payment iframe blocked by ad-blocker; silent failures
- ECL-1.1: Payment form location per processor; agent navigation to wrong page misses form
- ECL-5.2: Graceful degradation when Accept.js CDN script fails to load

---

## 4. Gaps and Notes

| Gap / Note | Detail |
|------------|--------|
| PAY-AN-017 BLOCKED semantics | Requires `checkout_multistep_enabled=true`; if flag is OFF the case is BLOCKED, NOT FAIL — verify flag before executing |
| GA-016, GA-025 (suite 043) | Datatrans is now the sole redirect processor; re-verify GA4 purchase event routing after VCST-5162 deploy — existing cases cover this indirectly |
| BL-PAY-* IDs are undefined | `BL-PAY-001` and `BL-PAY-004` referenced in PAY-AN cases do not exist in `business-logic.md`; map to BL-CHK-002/004 and BL-ORD-001/006 above. Gaps should be filed as proposed invariants |
| PAY-AN-012 deviation on prior build | Old build ee2627ef: no inline Luhn error; order CO260605-00010 created then fallback redirect to /checkout/payment. Re-run on ba0bcf37 is mandatory before closing this case as PASS |
| Duplicate-transaction window | AN sandbox blocks same-amount retries for ~3 min; serialize PAY-AN-014/016/017 or use different item totals |
