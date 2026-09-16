# Bulk-order mode switcher overflows its container at 375px and its options differ in height — P2

**Severity:** Medium / P2 · **Type:** Layout / responsive (BL-UI-004 content boundary, BL-UI-006 target spacing)

**Env:** vcptcore-qa @ Platform 3.1069.0, theme `2.58.0-pr-2474-62e6-62e635c6` · store `B2B-store` · chromium @ 375×812

## Summary
On `/bulk-order` at mobile width the three-option mode switcher (**From file / Copy&Paste / Manually**) is laid out in a `flex gap-1` wrapper with **no `flex-wrap`**. The options total more width than the container, so the last one overflows the content gutter; separately, one option wraps to two lines and ends up 20px taller than its siblings inside the same control group.

## Steps to Reproduce
1. Sign in as a B2B buyer (`test-john.mitchell-20260310@test-agent.com`).
2. Open `{{FRONT_URL}}/bulk-order` at a 375×812 viewport.
3. Inspect the mode switcher row.

## Expected vs Actual
**Expected:** the control group stays inside the content gutter at the narrowest supported viewport, and options in one group share a height.

**Actual:**
- Content measures **81.2 + 4 + 131.2 + 4 + 110.6 = 331px** in a **312px** container → **"Manually" overflows by 19px** (right edge 355 vs container 336).
- **"From file"** wraps to two lines → **57.6px tall vs 37.6px** for both siblings — a 20px mismatch inside one group.
- Inter-option gap is **4px**, below the ≥8px spacing guidance; the other three `VcTabSwitch` consumers use 8px.

The document itself does not scroll horizontally (`scrollWidth === clientWidth === 360`), so the overflow is contained visually rather than breaking the page — which is also why it is easy to miss.

## Root Cause
The wrapper in `client-app/pages/bulk-order.vue` is `.mb-5.flex.gap-1` — no `flex-wrap`, and a 4px gap. `VcTabSwitch` option width is content-driven, so three localized labels exceed the mobile gutter.

## Provenance — PRE-EXISTING, not caused by PR #2474
PR #2474 changed no CSS and did not touch `bulk-order.vue`; the wrapper is consumer markup. Found during the VCST-5890 `/qa-test` run while regression-testing the five `VcTabSwitch` consumers.

## Fix Routing
- **Repo:** `vc-frontend` · `client-app/pages/bulk-order.vue`
- **Kind:** frontend
- Add `flex-wrap` (and raise the gap to 8px) on the switcher wrapper, or let the options shrink/truncate at narrow widths.

## Evidence
`reports/tickets/Sprint26-15/VCST-5890/screenshots/C2-FAIL-bulkorder-light-375-overflow.png`
