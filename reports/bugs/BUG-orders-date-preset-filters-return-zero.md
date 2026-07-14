# Order-history quick date presets build a past window and return zero results `[P1]`

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368
**Ref:** REG-2026-07-14-0018 / ORD-063, ORD-064, ORD-065, ORD-066

## Summary
On `/account/orders`, every quick date preset builds the **previous** calendar period ending in the past rather than a trailing window ending now, so recent and same-day orders fall outside the range. Each preset returns "no results found" even though a same-day order (CO260714-00015) exists.

## STR
1. Sign in and place (or confirm) an order today; open `{{FRONT_URL}}/account/orders`.
2. Apply the **Last day** preset → range is 7/12–7/13 (yesterday's window, ends in the past).
3. Apply **Last week** → 7/5–7/12; **Last month** → all of June; **Last year** → all of 2025.
4. Observe the result list for each preset.

## Expected vs Actual
- **Expected:** A trailing window **ending now** — e.g. Last day = last 24h, Last week = last 7 days through today — so recent orders (incl. today's CO260714-00015) are included.
- **Actual:** Each preset is the previous completed calendar period ending in the past; all four exclude current/recent orders → "no results found" despite existing orders in range.

## Root Cause (suspected)
The preset range builder computes the prior calendar period (`end = start-of-current-period`) instead of anchoring the window end to `now`.

## Fix Routing
- **Repo:** vc-frontend (orders date-range preset builder)
- **Kind:** frontend
