# BUG-BOPIS-052 Reproduction Report: Pickup/Shipping Rapid Toggle Race Condition

## Status: REPRODUCED

**Date:** 2026-03-10
**Environment:** https://vcst-qa-storefront.govirto.com (QA)
**Storefront Version:** 2.43.0-alpha.2254
**Browser:** Firefox (via playwright-firefox MCP)
**Tester:** QA Testing Expert (Claude Opus 4.6)
**Account:** Coffee shop / Elena Mutykova (mutykovaelena@gmail.com)

---

## Summary

The bug is **confirmed reproduced**. Rapidly toggling between Pickup and Shipping delivery options on the cart page causes:

1. **GraphQL `ServiceAccessLocked` errors** -- the backend rejects concurrent `addOrUpdateCartShipment` mutations with "Service is busy."
2. **UI state desync** -- the toggle shows "Pickup" while displaying the shipping address, shipping cost ($150.00), and shipping total ($537.60) instead of the pickup location and $0.00 shipping.
3. **User-facing error toast** -- "Something went wrong. Please try again later." with "Report a problem" button.

---

## Reproduction Steps

### Step 1: Setup (PASS)
- Navigated to storefront, already signed in as Coffee shop / Elena Mutykova.

### Step 2: Cart Population (PASS)
- Cart was empty. Added 2x Xerox 3215 Monochrome Inkjet Printer GIFT+ ($149.00 each = $298.00 subtotal) via the "Recently browsed" section's increment button.

### Step 3: Baseline Test -- Slow Toggle (PASS)
Slow toggling (with 3-second waits between clicks) works correctly:

| State | Toggle | Address Shown | Delivery Method | Shipping Cost | Total |
|-------|--------|---------------|-----------------|---------------|-------|
| Initial | Shipping | gregerwg, rgrgr, 4543, Bulgaria | Select a delivery method | $0.00 | $357.60 |
| After Pickup click | Pickup | 20 W 34th St, New York, 10082, USA | N/A (pickup) | $0.00 | $357.60 |
| After Shipping click | Shipping | gregerwg, rgrgr, 4543, Bulgaria | Fixed Rate (Ground) | $150.00 | $537.60 |

All transitions were clean with no console errors.

### Step 4: Rapid Toggle -- Attempt 1 (PARTIAL)
- **Method:** 10 clicks at 100ms intervals via `setTimeout` loop in `browser_evaluate`
- **Result:** No console errors, no visible desync. The app either debounced or handled the 100ms interval gracefully.
- **Network:** All 16 GraphQL `addOrUpdateCartShipment` calls returned HTTP 200 with no errors.

### Step 5: Rapid Toggle -- Attempt 2 (REPRODUCED)
- **Method:** 16 clicks at 50ms intervals via `setTimeout` loop
- **Result:** **4 console errors** -- all `ApolloError: Service is busy.`
- **Error toast:** "Something went wrong. Please try again later." appeared.
- **GraphQL interceptor captured:**
  - 16 total `addOrUpdateCartShipment` responses
  - 12 successful, **4 failed** with error code `ServiceAccessLocked`
  - Failed responses arrived at nearly identical timestamps (~500ms window)
- **UI state after settling:** Shipping active, consistent display. No visible desync at this point.

### Step 6: Rapid Toggle -- Attempt 3 (DESYNC REPRODUCED)
- **Method:** 15 clicks (odd number, ending on Pickup) at 30ms intervals
- **Result:** **6 additional `ApolloError: Service is busy.`** errors (10 total in session)
- **Error toast:** Appeared again.
- **CRITICAL DESYNC OBSERVED:**

| Aspect | What UI Showed | What Should Have Shown |
|--------|---------------|----------------------|
| Toggle state | **Pickup** (checked) | Pickup |
| Label | **"Pickup point*"** | Correct |
| Address displayed | **gregerwg, rgrgr, 4543, Bulgaria** (SHIPPING address) | 20 W 34th St, New York (pickup location) |
| Shipping cost | **$150.00** (shipping rate) | $0.00 (pickup = free) |
| Total | **$537.60** (includes shipping) | ~$357.60 (no shipping cost) |

The UI toggle indicated Pickup was selected, but the address, shipping cost, and total all reflected Shipping configuration.

### Step 7: Post-Reload Verification
- After full page reload (`/cart`), the state resolved to **Shipping** mode with consistent data.
- The desync was **transient** -- it existed in the client-side state only and did not persist after reload.
- The server's last successfully written state was Shipping, which is what was displayed post-reload.

---

## Console Errors Captured

```
ApolloError: Service is busy.
    at pc (https://vcst-qa-storefront.govirto.com/assets/vendor-GH7P-2sI.js:...)
```

Total occurrences: **10 errors** across attempts 2 and 3 (4 + 6).

All errors originated from the `addOrUpdateCartShipment` GraphQL mutation.

## GraphQL Error Details (from interceptor)

```json
{
  "message": "Service is busy.",
  "path": ["addOrUpdateCartShipment"],
  "extensions": {
    "code": "ServiceAccessLocked",
    "codes": ["ServiceAccessLocked"]
  }
}
```

- **Attempt 2:** 16 mutations fired, 4 failed (25% failure rate)
- **Attempt 3:** 15 mutations fired, 6 failed (40% failure rate)

## Network Analysis

- All GraphQL calls returned **HTTP 200** -- errors were embedded inside the JSON response body (`errors[]` array), consistent with the known xAPI pattern where GraphQL returns errors inside HTTP 200.
- No 4xx/5xx HTTP failures observed.

---

## Screenshots

| # | Description | Path |
|---|-------------|------|
| 1 | Baseline: Shipping active (initial state) | `reports/bugs/screenshots/BOPIS-052-baseline-shipping-active.png` |
| 2 | Baseline: Pickup active (slow toggle) | `reports/bugs/screenshots/BOPIS-052-baseline-pickup-active.png` |
| 3 | Baseline: Shipping restored (slow toggle back) | `reports/bugs/screenshots/BOPIS-052-baseline-shipping-restored.png` |
| 4 | Pre-rapid-toggle state | `reports/bugs/screenshots/BOPIS-052-pre-rapid-toggle.png` |
| 5 | Post-rapid-toggle (attempt 2): error toast visible | `reports/bugs/screenshots/BOPIS-052-race-condition-error-toast.png` |
| 6 | Desync state (attempt 3): Pickup toggle + shipping data | `reports/bugs/screenshots/BOPIS-052-desync-state.png` |
| 7 | Post-reload: server state resolved to Shipping | `reports/bugs/screenshots/BOPIS-052-post-reload.png` |

---

## Root Cause Analysis

The `addOrUpdateCartShipment` GraphQL mutation acquires a lock on the cart aggregate. When multiple mutations are fired in rapid succession (< 50ms apart), concurrent requests compete for the same lock. The backend responds with `ServiceAccessLocked` / "Service is busy." for requests that cannot acquire the lock.

The frontend does not:
1. **Debounce** the toggle clicks -- each click immediately fires a mutation.
2. **Queue** mutations sequentially -- all are fired concurrently.
3. **Cancel** in-flight mutations when a new toggle click occurs.
4. **Reconcile** the UI state after failed mutations -- the last response to arrive (which may not be the last click) determines the displayed state.

This results in a race condition where the UI reflects the response order (non-deterministic) rather than the user's intended final selection.

## Differences from Original Report

- Confirmed: `ApolloError: Service is busy.` errors occur as originally reported.
- Confirmed: UI state desync between toggle position and displayed data.
- Additional finding: The desync is **transient** -- a page reload resolves it by fetching server state.
- Additional finding: The 100ms toggle interval does NOT trigger the bug; 50ms or 30ms intervals are required.
- Additional finding: The error code is `ServiceAccessLocked` on the `addOrUpdateCartShipment` path.

---

## Severity Assessment

**Severity: Medium (P2)**

**Justification:**
- The race condition requires deliberate rapid clicking (< 50ms intervals), which is unlikely in normal usage but possible with impatient users or accessibility tools that may fire rapid events.
- The desync is transient and self-corrects on page reload.
- The error toast "Something went wrong" is user-facing and creates a poor experience.
- No data corruption occurs -- the server state remains consistent; only the client-side display desyncs temporarily.
- The bug is in the checkout-adjacent cart flow, but does not directly cause incorrect orders (the "Place Order" button remains disabled during desync due to incomplete required fields).

**Recommended fix:** Add client-side debouncing (200-300ms) on the Pickup/Shipping toggle, or cancel in-flight `addOrUpdateCartShipment` mutations when a new toggle click occurs (AbortController pattern).
