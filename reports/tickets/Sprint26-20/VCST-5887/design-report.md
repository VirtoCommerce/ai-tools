# VCST-5887 design report (visual lane 4v)

qa-design skill: loaded. Browser: Chrome DevTools MCP. Env vcptcore_qa1, theme 2.60.0-pr-2564-ff59, preset Red (`--color-primary-500` = #e52121). Auth: punchout start link (PO-100), one link per session.
Screenshots: `screenshots/4v-*.png`. Scope: /cart in punchout mode, 1920 and 375 px, en + de.

## Verdicts

| Axis | Verdict | Evidence |
|---|---|---|
| vs. DESIGN | SKIPPED | Ticket has no Claude Design / Prototype link. Not a pass. |
| Contrast, enabled button (1.4.3) | PASS | white on #e52121 = 4.59:1, 16 px bold. Hover darkens, no shift (y 508.2 before and after). |
| Contrast, disabled button | PASS (exempt) | #525252 on #e5e5e5 = 6.2:1 anyway. |
| Focus visibility (2.4.7 / 1.4.11) | PASS | Real Tab: `:focus-visible` true, 1.6 px solid rgb(59,130,246) with 1.6 px offset, drawn on the white card, about 3.7:1. |
| Keyboard reachability | PASS | Tab reaches the button in DOM order after Total. Enter activates it (spinner shown, navigates to the return URL). |
| Disabled state exposed | PASS | No line selected: native `disabled`, grey fill, `cursor: default`. |
| Busy / loading announced | PARTIAL | `aria-busy` + disabled only while the cart loads. After Enter the spinner replaces the label and the 43.2 px height is kept. No live-region text. Spinner is a faint ring on red. |
| Error toast announced | PASS | Single toast, 320 px wide, top-right, with a 28x28 Close button. It lives in `.notifications-host[aria-live=polite]`. Toast contrast not measured: it auto-dismissed, and I did not click again. |
| Token consistency vs Place order | PASS | Same `vc-button--solid--primary--md--full-width`. The reused `data-test-id="place-order-button"` / `sticked-place-order-button` mean identical geometry (238x43.2 desktop). |
| Touch target / overflow (BL-UI-004/006) | PASS | 375 px: sticky 327x43.2, no horizontal scroll (scrollWidth 375). Sticky bar does not hide the focused Order comment field. |
| Label truncation de | PASS with note | "Bestellanforderung erstellen": 375 px = 1 line. 1920 px = 2 lines (139 + 63 px), 40 of 43.2 px used, no clipping but tight, while "Create requisition" is 1 line. |
| Label truncation fi | SKIPPED | Finnish is not offered by this store (language list: it, fr, de, es, ru, pl, zh, en, ja, pt). The fi file cannot be checked live. |
| axe (WCAG 2.2 AA) | PASS for the changed control | Violations: `aria-allowed-attr` on the select triggers and `image-alt` on placeholder images, both outside the changed code. Incomplete: color-contrast (computed by hand above). |
| BL-UI-001..005 on the control | PASS | No CLS, no hover shift, label swapped for spinner with no size change. |
| Screen-reader output | MANUAL | Not available. |

## Findings

1. UX, severity 2 (Nielsen). The hint "Complete all required information to proceed." appears next to an ENABLED Create requisition (shipping address, delivery method and payment are all empty). It reads as a blocker the button ignores. It is the same text when the button is disabled (no line selected), so it never says why. Not in the spec; filing is the caller's decision.
2. Low. de label wraps to 2 lines at 1920 px only (see above).
3. Low. Loading spinner on the red button is low-contrast and has no text alternative. Only `aria-busy` was seen, and only during page load.
4. Out of scope, pre-existing: at 375 px the header notification badge "435" wraps to 3 lines, a vertical pill (BL-UI-004). `4v-375-top.png`.
5. Out of scope, pre-existing: with the line unchecked, Order Summary still shows Subtotal $89.00 / Total $71.20 while the line Subtotal shows $0.00.

## Not done / caveats

- The success click was done once, by keyboard Enter. The error toast was taken on a second click after returning (SessionExpired path).
- The loading state was captured once, at the moment of Enter (`4v-desktop-after-enter.png`).
- Disabled and error states at 375 were not exercised; only the sticky bar and the label were.
- The first browser context hung after switching language to de at 375 px (session lost). A fresh isolated context and new start links were used. Cart contents were not changed; selection was toggled off and back on.

## Round 2 — 2026-10-20 (rerun with a filled cart)

Lane 4v, Chrome DevTools MCP (isolated contexts), vcptcore_qa1, theme `2.61.0-pr-2564-69d4-69d4418b` (footer; PR head 69d4418 build). Buyer: MULTI-ORG punchout mapping (AGENT-TEST-PO-200), BuyerCookie `AGENT-R2-V2-<ts>`. "Punchout mode" badge shown in every session. Screenshots `screenshots/r2-V2-*.png`.
Interrupted twice (browser restart, orchestrator restart); the run is PARTIAL. Not re-run: 768/375, toast, success click. Observation window note: Punchout.Enabled was OFF ~11:41Z-12:43Z; every state below showed punchout mode on and the feature UI present, so none of it is a window artefact.

**Buyer cart state.** Start (recorded in UI, one `default` cart): AGENT-TEST-Gaming-Laptop (LT-001) x1, $1,299.99. I added LAYS CHIPS PAPRIKA BOX (6051795) x1 and AGENT-TEST-PO-PLAIN-001 x1. End (restored via UI Remove from cart, reload-verified): Laptop x1, $1,299.99, badge 1, no other lines. The second empty `default` cart the orchestrator saw is not visible in the UI and was not created or touched by me.

| Axis | Verdict | Evidence |
|---|---|---|
| vs. DESIGN | SKIPPED | No Prototype link on the ticket. |
| Removed sections layout (1920) | PASS | Cart with 3 lines: no Shipping/Payment/Order comment/incomplete hint/quote widget, no orphan headings (H1 Cart, H3 coupon cards only), no gaps. Left card and Order summary both start at y=345. Summary order: totals, Create requisition, disclaimer, Discount & coupons. `r2-V2-1920-cart-3lines.png` |
| Right column alignment | PASS | Summary and coupons cards share x=1184, w=288; button 238.4x43.2, bg #e52121, white 700 16px (4.59:1, as round 1). |
| Create requisition accessible name | PASS | role=button, name "Create requisition" (text), not disabled with lines selected. |
| BL-UI-004 overflow (1920) | PASS | scrollWidth = innerWidth. |
| BL-UI-006 target size | PASS for cart | Sub-24px items are only header category links (17 px tall), skip links, breadcrumb "Home" (pre-existing, outside the PR) and 1x1 hidden checkbox inputs (visible box is a custom element). |
| axe (wcag2a/aa, 21aa, 22aa) punchout cart, filled | PASS | 0 violations. 1 incomplete: aria-prohibited-attr (aria-labelledby on div without role, `div[aria-labelledby=title11]`) - manual check, pre-existing pattern. |
| Disabled state | PASS | After removing the lines I added, the button rendered `disabled` while the cart refreshed (transient, one snapshot); enabled again after reload. |
| Round 1: "Toggle vendor select" names (VCST-6374) | STILL PRESENT | All 4 cart checkboxes (select-all + each line) carry the same name "Toggle vendor select", no product in the name. Not re-filed. |
| Round 1: spinner contrast / text alternative | NOT REACHED | Needs the success click, which leaves the site and would send a requisition for a shared buyer; not done. Round 1 stands. |
| Round 1: de label wrap at 1920 | NOT REACHED | No language switch this pass. Round 1 stands. |
| Sticky bar, 768 / 375, no overlap | NOT REACHED | Interrupted before resize. |
| Loading state announced | NOT REACHED | See spinner row. |
| Error toast (role, aria-live, focus) | NOT REACHED | Could not unselect all lines: the checkboxes are 1x1 hidden inputs, the DevTools MCP click/fill on their uid times out ("not interactive") and the tool has no coordinate click. Real users can click the visible box; this is a tool limit, not a product finding. Toast path via UI not exercised. |
| Screen-reader output | MANUAL | Not available. |

### Findings
1. Low (re-check, VCST-6374): identical checkbox names "Toggle vendor select" x4 on the punchout cart (WCAG 2.5.3/4.1.2 name quality; axe does not flag it).
2. Info: the cart view takes 60-120 s to render on this stand (header spinner, empty main). Not a layout finding; it caused my measurement delays.
3. Info: Order summary Subtotal/Total briefly lag the line list during removal ($1,311.99 vs line $1,299.99 for one frame). Self-corrects after refresh. Not filed.

### Not done
- Success click, error toast, 768/375, German, Lighthouse. All other incidental round-2 empty-state notes from the earlier pass were dropped from this rerun; the SalesRep version-skew notification was not rechecked.

## Round 3 — 2026-10-20

Lane 4v, Chrome DevTools MCP, vcptcore_qa1, theme `2.61.0-pr-2564-2fa8-2fa83310`, MULTI-ORG buyer (AGENT-TEST-PO-200), BuyerCookies `AGENT-R3-V-<ts>` (3 sessions). Screenshots `screenshots/r3-V-*.png`. vs. DESIGN: SKIPPED (no prototype link).
**Buyer carts.** Start: `default` = AGENT-TEST-Gaming-Laptop (LT-001) x1, $1,299.99. Added LAYS CHIPS PAPRIKA BOX (6051795) x1 for the test, removed via UI. End: Laptop x1, $1,299.99, badge 1. I never saw a second cart in the UI.
**Note:** Create requisition was clicked twice in total (a first pass to capture the spinner frame, a second to read its DOM). Each posts a requisition to the tester page; the cart is NOT cleared by it.

| Axis | Verdict | Evidence |
|---|---|---|
| 768 px, 2 lines | PASS | Two columns, summary inline (256 px wide, x 473-729 of 768), Create requisition 206x43. No sticky bar at 768 by design (inline button shown). scrollWidth = 768. `r3-V-768-cart.png` |
| 375 px (emulated mobile), sticky bar | PASS | Fixed bar y 709-812, z 10, "Total: $1,309.99" + button 327x43; inline button also in summary. scrollWidth = 375, no content overflow. Content never covered while scrolling. `r3-V-375-cart-top-sticky.png` |
| 375 px, bar vs footer | FAIL (Low-Medium) | At the page end the bar (103 px) overlaps the bottom 103 of the 214 px footer: the "Ver. 2.61.0 ... All rights reserved / ASP.NET ecommerce platform" strip can never be scrolled clear of it (docH 2098 = footer bottom, no bottom padding). `r3-V-375-cart-bottom.png` |
| BL-UI-004 / 006 at 375 | PASS | No overflow. Targets < 24 px: only skip links and the footer "Virto Commerce" link (pre-existing). Line controls and the bar button >= 32 / 43 px. |
| Loading state, spinner contrast | PASS | Frame captured (`r3-V-1920-loading-spinner.png`; both the summary and sticky buttons spin together, label hidden, height unchanged). Loader: white arc (4.59:1 on #e52121) on a rgb(212,212,212) track (3.1:1 on red) - both >= 3:1 (1.4.11). Round 1 "faint ring" = the track; passes narrowly. |
| Loading state, busy / text alternative | PASS with note | Recorded DOM: `aria-busy="true"` + `disabled`, class `vc-button--loading`, label text stays in the DOM (`.vc-button__slot` "Create requisition"), loader span has no role/label. Name is kept. Note: `disabled` removes keyboard focus mid-request and the `aria-live` regions stay empty, so no "busy" announcement (advisory, Low). |
| German label wrap, 1920 /de/cart | FAIL (Low, unchanged from round 1) | "Bestellanforderung erstellen" wraps to 2 lines (139 + 63 px) in the 238x43.2 button, 40 of 43.2 px used; English is 1 line. `r3-V-1920-de-cart.png` |
| Error toast role / aria-live / focus | NOT REACHED | Needs all lines unselected; the line checkboxes are 1x1 hidden inputs, uid click/fill from DevTools MCP times out as "not interactive" and there is no coordinate click. Tool limit. Not provoked another way (no store settings changed, no cart mutation via hidden inputs). |

### Findings
1. Low-Medium: sticky Create requisition bar hides the footer legal/version strip at 375 px (steps: punchout /cart, 375 wide, scroll to bottom). Evidence `r3-V-375-cart-bottom.png`. Cause: fixed bottom bar with no bottom padding on the page.
2. Low (re-check, VCST-6374): the checkboxes keep the single name "Toggle vendor select" ("Anbieter-Auswahl umschalten" in de) on every line.
3. Low: at 768 and 375 the two "Save for later" icon buttons and the header notifications button have no accessible name (icon-only, no aria-label); in the 1920 layout "Save for later" has text. Pre-existing cart component, not PR-specific.
4. Low: German label wraps at 1920 (round 1 carry-over).
