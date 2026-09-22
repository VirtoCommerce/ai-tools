# VCST-5831 — Verification checklist

**Flow** verify-fix · **Verdict VERIFIED WITH NOTES (PASS_WITH_NOTES)** · 2026-09-08
**Build** theme `2.57.0-pr-2471-6ed5-6ed5dc1b` — vc-frontend PR #2471, **open/unmerged**, prerelease-deployed. Confirmed live from the footer and corroborated byte-for-byte against the shipped `/assets/missions-CQrLEBbx.css`.
**Env** vcst-qa storefront · Chrome DevTools MCP · viewports 375 / 768 / 1024 / 1280 / 1920

> **Identity deviation.** The pre-signed DevTools profile was signed out and this lane has **no `--secrets`**, so signing in as `LOYALTY_VIP_USER` would have required a plaintext password — forbidden. The agent took `browser-lanes.md`'s third sanctioned path and minted `AGENT-TEST-uiux-20260908111036@test-agent.com` via `/sign-up`. Valid here because missions use `AnyUserGroupCondition`, so mission **definitions** (windows, SKUs, geometry) are identity-independent. **Needs manual cleanup** — Admin → Security → Users; storefront-registered contacts are not swept by any prefix sweep. No state mutated: no cart add, no order, steppers left at 0.

## Phase A (RED) baseline

`screenshots/baseline-RED-from-ticket-attachment.png` — the ticket's own 375 px attachment, read this run: three rows each showing `AGENT-TEST…`, stepper sharing the row, info column 95 px.

## Phase B (GREEN) — measurements at 375 px, 3/3 runs byte-identical

`AGENT-TEST-MSN-PERSKU-ALL` seeds **2** target SKUs, not 3.

| Measure | Before | Now |
|---|---|---|
| `__info` width | 95 px | **233 px** (2.45×) |
| `__item` `flex-wrap` | `nowrap` | **`wrap`** |
| `__stepper-wrap` `flex-basis` | — | **`100%`** (rect 321×78, own row at y=318.4 vs info row ending 302.4) |
| `__stepper-wrap` `padding-inline-start` | — | **88 px** (= 5.5rem) |
| `__stepper-wrap` `align-items` | `flex-end` | **`flex-start`** |

Deployed media-query mapping matches the diff exactly: `__stepper-wrap` reverts at `min-width:640px`; `__actions`→`flex-nowrap`, `__reward`→`me-auto basis-auto`, `__action`→`min-w-32 flex-none` all at `min-width:768px`.

## Checklist

| # | Item | Verdict |
|---|---|---|
| 1 | Product names mutually distinguishable at 375 px | **PASS (qualified)** — see note |
| 2 | Info column ≫ 95 px | **PASS** — 233 px |
| 3 | Stepper occupies its own full-width row below `sm` | **PASS** |
| 4 | No desktop regression at 768/1024/1280/1920 | **PASS** — 3-column row intact, names untruncated, footer single line |
| 5 | BL-UI-004 no overflow / no silent clipping | **PASS** — `scrollWidth === innerWidth` at all five; the 2 clipped titles carry `title` + visible ellipsis, so declared not silent. Sticky-footer occlusion checked: total row reachable |
| 6 | BL-UI-006 touch targets (11 controls at 375 px) | **PASS** — 2 WARN, both by-design kit sizes |
| 7 | BL-UI-005 stepper alignment ≤ 1 px | **PASS** — centre-Y spread **0.00 px** |
| 8 | BL-UI-003 no state-induced shift from the new wrap | **PASS** — 0 of 11 tracked elements moved (hover CLOSE, hover Increase, 2× Tab) |
| 9 | No new console errors, no 4xx/5xx | **PASS** — 114 requests, zero 4xx/5xx; 1 pre-existing WebSocket warn |
| 10 | `vs. DESIGN` | **SKIPPED — UNSPEC**, never PASS |

**BL-UI-006 detail** — gate derived from `UI_KIT_BUTTON_SIZES_PX = {xxs:26, xs:32, sm:38, md:44, lg:52}`, never hardcoded 44. Header × 68×68 PASS; stepper −/+ 32×32 = kit `xs` exactly (AA pass, WARN to AAA); quantity input 56×30 (AA pass, WARN to AAA); CLOSE and ADD TO CART 327×44 = kit `md`. Product-title link exempt under SC 2.5.8's inline-text exception. Four pairs at 1 px spacing are the kit's segmented stepper sharing one border — all parts ≥24×24 so SC 2.5.8 passes on size, and byte-identical pre-fix, so **not a PR-2471 regression**.

**`vs. DESIGN`** — the approved design declares no mobile artboard for this modal (Frame 3 is 660 px desktop), so the axis is **UNSPEC**, not DRIFT; `DesignSync` additionally needs `/design-consent`, unavailable here. Recorded SKIPPED.

## The note on item 1 — why WITH NOTES rather than clean

The two name cells still render **identical** visible text, `AGENT-TEST Missions PerSku Targ…` — `-webkit-line-clamp: 1` on a 233 px column while `scrollHeight` is 33 px (2 lines needed) and 321 px is available. So the ticket's literal *Actual* line is unchanged.

The ticket's **harm** is nonetheless fixed: *"three identical labels above three steppers, cannot tell which product each stepper controls"*. Each stepper now sits on its own row directly beneath its own fully-visible subtitle — `SKU #AGENT-TEST-MSN-TARGET-B · $42.50` vs `SKU #AGENT-TEST-MSN-TARGET-A · $30.00` — so the row identifies its product. The ticket's *Expected* offered two acceptable resolutions ("the name wraps, **or** the row reflows to stack"); the reflow branch shipped. Full name remains in the DOM with `title`, so AT parity holds.

`line-clamp: 2` would show both names in full and close the residual — cheap follow-up.

## Not filed (below severity floor)

- **Low** · in-scope · PR #2471's own `min-w-32` on the footer buttons is **dead code**: `.vc-button:not(…){min-width:var(--min-w)}` outspecifies it and `--min-w` is undefined → computed `min-width: auto`, CLOSE renders 79.3 px not ≥128 px. `flex:none` and `order` from the same rules do apply.
- **Low** · pre-existing · summary renders `Cart subtotal 0` rather than `$0.00` — `formatCurrency` falls through to decimal when the currency is unresolved in the empty state (BL-PRICE-003).

## Coverage gap

No regression case covers this modal at mobile width. Route in is `/qa-test-lifecycle`.
