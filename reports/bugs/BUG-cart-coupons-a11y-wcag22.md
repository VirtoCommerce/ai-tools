# Cart Coupons Widget — A11y: WCAG 2.2 AA gaps (labels, error association, status messages, focus indicator) [Moderate]

## Status: READY_TO_SUBMIT — filed as [VCST-5533](https://virtocommerce.atlassian.net/browse/VCST-5533) (Bug, Medium)
_Prior lineage on this widget: VCST-5017 (aria-label, Done), VCST-5018 (error announce, Done), VCST-5019 (touch target, Cancelled). This ticket covers the 4 remaining Moderate findings below._

**Env:** vcst-qa @ Theme 2.54.0-pr-2382-f17b · Coffee theme (light) · Chrome DevTools MCP · authenticated (`USER_EMAIL`)
**Component:** `/cart` "DISCOUNT & COUPONS" sidebar widget (VCST-4896) — located by selector `.coupons-section` / preset `.coupon-card`; no `file:line` (located by selector only).

## Summary
Coupon widget passes the automated axe scan (no Critical/Serious violations inside it), contrast, target size and keyboard. Manual + measured checks surface a cluster of **Moderate** WCAG 2.2 AA gaps in labelling, error association, status announcements, and focus-indicator quality. None is a P0 blocker; all are genuine and fixable.

## Confirmed findings (dedup by rule × element family)

| # | WCAG | Element (count) | Measured vs required | Issue |
|---|------|-----------------|----------------------|-------|
| 1 | 4.1.3 Status Messages (AA) | order-summary Discount/Total + "coupon applied" | 3 `aria-live=polite` regions stayed **empty** across 2 post-apply reads | Applying a coupon changes Discount (−$50.00) + Total but nothing is announced; state conveyed only by button label flip Apply→Remove. SR user gets no confirmation. (Invalid-code path DOES announce via `role=alert` — so the mechanism exists, just not wired for success/total.) |
| 2 | 3.3.1 Error ID / 1.3.1 (A) | custom-code input `#input-785` (1) | error `role=alert` present but input `aria-invalid=null`, `aria-describedby=null` | Invalid-coupon error "This code is not valid" is visible + announced, but not programmatically tied to the field — SR user tabbing back to the input hears no error/description. |
| 3 | 3.3.2 Labels / 1.3.1 (A) | "Enter custom code" inputs (5: 1 editable + 4 readonly presets) | accessible name = placeholder only; visible "Custom code" text NOT associated (no `for`/`id`, `aria-label`, `aria-labelledby`) | Placeholder-only labelling; visible label not linked. Presets mitigated (readonly + adjacent labelled button). |
| 4 | 2.4.7 Focus Visible / 1.4.11 (AA) | preset Apply buttons + "View all" link | focus outline `srgb(0.6 0.42 0.35 / 0.3–0.4)` (brown @30–40% α) ≈ **~1.5:1** vs white; need ≥3:1 | Keyboard focus indicator is a very faint low-alpha outline, easily lost. |

**Incidental /cart bugs (outside widget, out-of-scope-bug rule):** `aria-allowed-attr` (critical) — Delivery/Payment custom selects carry `aria-required="true"` on `role="button"` (`#select-709-trigger`, `#select-731-trigger`); `image-alt` (critical) — shipping-method placeholder SVG + a product placeholder have no alt; `nested-interactive` (serious) — header theme toggle `.dark-mode-toggle .vc-popover__trigger` has focusable descendants. File separately.

## STR (from /cart with ≥1 item, Coffee theme, signed in)
1. Open the coupon widget → **Tab** through it: focus outline is barely visible (finding 4).
2. Click a preset "Apply coupon" → Discount/Total update but no `aria-live` announcement (finding 1).
3. Type a bad code in "Custom code" → Apply → red "This code is not valid" shows (`role=alert`, 4.58:1 — OK) but input isn't `aria-invalid`/`aria-describedby` (finding 2).
4. Inspect the custom-code field → only a placeholder names it (finding 3).

## Expected vs Actual
- **Expected:** discount/total change + coupon-applied announced via `aria-live`; invalid error tied to field via `aria-describedby` + `aria-invalid=true`; a persistent programmatic label on the code input; focus indicator ≥3:1.
- **Actual:** success/total change silent to SR; error visually shown + alerted but not field-associated; placeholder-only label; ~1.5:1 focus outline.

## Suggested fixes
1. Populate a polite live region with e.g. "Coupon ZUR10 applied, discount $50.00, new total $1,312.80" on apply/remove.
2. Add `aria-invalid="true"` + `aria-describedby="<error-id>"` to the code input on failure.
3. Associate the visible "Custom code" label (`<label for>` or `aria-labelledby`); keep placeholder as hint only.
4. Raise focus-outline alpha to ≥1.0 (opaque brown `#996C5A` gives ~2.9:1 border; pair with a light-offset ring) so the indicator clears 3:1.

![Invalid-coupon error state](../tickets/VCST-4896/screenshots/coupon-widget-invalid-error.png)

**PASS (measured, no action):** contrast — headings/codes 19.8:1, "Expires" 7.81:1, Apply icon 4.52:1, Remove icon 4.21:1, "View all" 6.41:1, error text 4.58:1; target size 26×26 ≥24 (2.5.8 AA); keyboard reachable/ordered/no-trap; color not sole channel (1.4.1). Lighthouse a11y (page) 90.
**Mobile note (BL-UI-006 / 2.5.5 AAA, not AA):** Apply buttons stay 26×26 at ≤500px — below the 44×44 mobile comfort guidance; passes the 2.5.8 AA 24px gate.
