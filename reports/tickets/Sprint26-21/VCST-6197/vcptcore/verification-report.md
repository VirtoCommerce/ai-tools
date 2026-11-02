# VCST-6197 — Verify fix (Phase B, GREEN) — vcptcore-qa

**Verdict: PASS — fix confirmed, no regression found.** Bug no longer reproduces in 3/3 STR runs, a fresh load at 375 or a pre-scrolled page.

| | |
|---|---|
| Build | theme `2.61.0-pr-2608-86ad-86adb577` (read from the live `remoteEntry` bundle, 2026-11-02) |
| Env / store | vcptcore-qa storefront, B2B-store |
| Account | `agent-test-sr-primary@example.com` (SR_REP_PRIMARY), signed in on the first attempt |
| Browser | playwright-chrome (Chromium), 1920×1080 → 375×800, plus 1440×900 |
| Date | 2026-11-02 |

Measurement note: the headed Chromium lane draws a classic 15px scrollbar, so at a 375 viewport `clientWidth` = **360**. The criterion "scrollWidth 375" becomes **scrollWidth == clientWidth (360)**. With no horizontal overflow, the two are equal. Pre-fix it was 582–599.

## STR — 3 consecutive runs, /company/customer-orders (load at 1920, resize to 375)

| Run | Open | scrollWidth / clientWidth | scrollX | scrollY | panel left–right | focus in panel |
|---|---|---|---|---|---|---|
| 1 | 1 (lazy) | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 1 | 2 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 1 | 3 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 1 | 4 (extra) | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 2 | 1 (after an open at 1920) | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 2 | 2 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 2 | 3 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 3 | 1 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 3 | 2 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| 3 | 3 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| Fresh load at 375 | 1 (lazy) / 2 | 360 / 360 | 0 | 0 | 0 – 343 | yes |
| Pre-scrolled to Y=120 | 1 / 2 | 360 / 360 | 0 | 120 → 119.2 | 0 – 343 (top 141) | yes |

How each run closed the panel: run 1 used Close, Escape and Escape; run 2 used Escape; run 3 used the Close button. Panel top was 260, just under the trigger. Pre-fix (RED) reopen: scrollWidth 582–599, scrollX 224, panel x 256–599.

## Checklist

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | No horizontal scroll on any reopen at 375, 3 runs | PASS | table above: 13 opens, all sw == cw, scrollX 0 |
| 2 | Panel within the viewport on every open | PASS | left 0 ≥ 0, right 343 ≤ 360 every time |
| 3 | Focus moves into the panel and the page does not scroll (also pre-scrolled and fresh at 375) | PASS | activeElement = `vc-popover__body` (inside the dialog). scrollY 0→0, and 120→119.2 (sub-pixel) |
| 4 | Escape and Close close the panel and return focus to the Filters trigger | PASS | both: dialogs 0, activeElement = BUTTON "Filters" (aria-expanded=false) |
| 5 | Filters work: pick, apply, list updates, reset clears | PASS | Status "Cancelled": only Cancelled orders, chip shown. Date range 11/01–11/02: chips + "No orders match this filter". "Reset filters" clears it. Apply stays disabled until a value changes (by design) |
| 6 | /account/orders filters at 1440 and 375 | PASS | 1440: VcPopover bottom-end under the trigger (panel 953–1393, trigger right 1393, top = trigger bottom + 8), 2 opens, sw == cw, scrollY 0, focus in. "New en1" applied, then reset. 375: full-height mobile sidebar (not a VcPopover), sw 375, no scroll, "Payment required" applied (1 order) |
| 7 | Date-picker popover opens, focus moves in, no scroll jump, a date can be picked | PASS | customer-orders 375: Calendar dialog, focus on "Monday, November 2, 2026", sw/scroll unchanged. Range 11/01–11/02 picked and Escape returns focus to the Start date input. Same on /account/orders sidebar (see observation O-1) |
| 8 | Desktop 1920/1440 customer-orders: panel under the trigger (bottom-end) | PASS | 1920: panel 1214–1654, trigger right 1654, top 346 = trigger bottom 338 + 8. 1440: panel 953–1393, trigger right 1393 |
| 9 | No new console errors or failed requests during the flows | PASS | 0 console errors from sign-in onward. Only clean WebSocket-close warnings on navigation, and the App Insights `/v2/track` noise. The pre-login asset errors (`ERR_HTTP2_PING_FAILED`, `ERR_NETWORK_IO_SUSPENDED`, `ERR_NETWORK_CHANGED`) came from the local network dropping during the first load, not from the app. A curl a minute later served the same assets 200 |
| 10 | BL-UI-004: no document horizontal scroll at 375 on any page. Resize 375→1440 with the panel open, then reopen | PASS | The open panel re-anchored at 1440 (953–1393, focus kept). Reopen at 1440 was correct, and after resizing back to 375 the panel showed 0–343 with sw == cw |

## Observations (not filed; none is a regression of PR #2608)

- **O-1 (Low, cosmetic, likely pre-existing):** on /account/orders at 375, the Calendar popover opened from the mobile Filters sidebar flips above its field. It is placed at top **−19px**, so its top padding is cut off by the viewport. The month and year navigation stays visible and usable. The fix only adds `preventScroll` and does not change positioning, so this most likely comes from Floating UI flip/shift without a cross-axis shift. A control run on a pre-fix build would be needed to call it pre-existing. Screenshot: `screenshots/account-orders-375-calendar-clipped.png`.
- **O-2 (Info):** at 375 the customer-orders panel sits flush at x 0 (right 343, about 17px gap on the right). The brief expected about 8–351. It is inside the viewport, so it is not a defect. The asymmetry is a design question, not a fix failure.
- **O-3 (Info, a11y):** the /account/orders mobile filter trigger shows in the accessibility tree as a `button` with no accessible name. Playwright resolved it by inner hidden text "Filters". Not checked against design. This is unrelated to the fix.

## Evidence (paths relative to this folder)

- `screenshots/customer-orders-375-reopen2.png`: 2nd open at 375 (the step that failed before the fix), panel in viewport, no offset
- `screenshots/customer-orders-375-datepicker.png`: Calendar popover inside the Filters panel at 375
- `screenshots/account-orders-375-filters.png`: /account/orders mobile Filters sidebar
- `screenshots/account-orders-375-calendar-clipped.png`: observation O-1
- `console.log` (whole session, warning+) and `network.txt` (last page, non-static)
- HAR: lane writes `test-results/chrome/har/session.har` (not committed)
- RED baseline: `reports/tickets/Sprint26-20/VCST-6001/screenshots/ab-5-mobile-hscroll.png`, `reports/bugs/open/medium/BUG-SalesRep-CustomerOrders-Mobile-Drawer-Horizontal-Overflow-VCST-6197.md`

## KB

- Ask returned no matching entry, so `kb_none` was recorded.
- Captured **KB-D04A9D30**: reopen at 375 has no horizontal scroll on 2.61.0-pr-2608. It is queued and not yet pushed.
- Related entry: KB-D89CB35F says /company/customer-orders is served by the Module Federation sales-rep plugin chunk. The fixed behaviour was nonetheless observed live on that page.

No Jira or GitHub writes were made, and no ticket transition. No test data was created, so there is nothing to tear down.
