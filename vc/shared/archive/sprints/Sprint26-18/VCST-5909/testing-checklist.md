# VCST-5909 — Verification checklist

**Flow** verify-fix · **Verdict VERIFIED (PASS)** · 2026-09-08
**Build** theme `2.57.0-pr-2471-6ed5-6ed5dc1b` — vc-frontend PR #2471 (`fix/VCST-5910-missions`), **open/unmerged**, prerelease-deployed to vcst-qa. Confirmed live: footer `Ver. 2.57.0-pr-2471-6ed5-6ed5dc1b`, and `pr-2471-6ed5-6ed5dc1b` present in the served `/assets/index-DdGJ8tPe.js`.
**Env** vcst-qa storefront · account `LOYALTY_VIP_USER` · `playwright-chrome`

## Root cause and fix

`useNotifications.open()` arms its auto-close `setTimeout` **only** when `notification.duration` is truthy, and there is no default. The old call site passed no `duration`, so no timer was ever created and the toast could only be dismissed by its close button.

Fix: `sku-mission-modal.vue` `addProductsToCart()` now passes `duration: 10000` on both the success and error toasts. Confirmed in the **served** lazy chunk `/assets/missions-BcSxYGbV.js`:
`P.success({text:$("pages.account.missions.sku_modal.added_to_cart"),duration:1e4})`.

> Routing note: PR #2471's description references only VCST-5910 / 5831 / 5825. This ticket's fix rode along uncredited, and its STR lives in a Jira **custom field**, not the description — the description alone reads as empty.

## Phase A (RED) baseline

Fix was already deployed on pick-up, so no live RED was obtainable. Baseline taken from the ticket's own reported behaviour + the confirmed source mechanism above. The ticket's `.mp4` attachment (34 MB) **could not be analysed** — video is not a readable format here. Stated as a gap, not a silent skip; the STR and source mechanism are unambiguous without it.

## Phase B (GREEN) — STR, 5 runs

Mission `AGENT-TEST-MSN-PERSKU-ALL`. Toast copy `Products added to cart`, green success variant.

| Run | Elapsed from click | From confirmed-present | Dismissed unaided |
|---|---|---|---|
| 1 | ≤ 12.6 s | ≈ 10.2 s | yes |
| 2 | ≤ 15.3 s | — | yes |
| 3 | ≤ 12.0 s | — | yes |
| 4 | ≤ 10.5 s | — | yes |
| 5 | ≤ 15.5 s | — | yes |

Brackets are MCP-side timestamps and carry ~2–2.5 s/call snapshot overhead plus a 1–3 s click→toast lag, so click-anchored figures are **upper bounds**. All five consistent with the served `duration:1e4`; none near the 20 s fail threshold.

## Checklist

| # | Item | Verdict |
|---|---|---|
| 1 | Toast auto-dismisses with zero interaction, 3/3 | **PASS** (5/5) |
| 2 | Close button still dismisses immediately | **PASS** — clicked at +5 s, gone on next probe |
| 3 | Products actually landed in cart | **PASS** — 7 items, subtotal $260.00, `itemsQuantity: 7` |
| 4 | Correct success variant + copy | **PASS** |
| 5 | No new console errors on the missions page | **PASS** — 0 errors |
| 6 | No 4xx/5xx; no GraphQL `errors[]` inside a 200 | **PASS** — 12 response bodies dumped, zero hits |
| 7 | BL-UI-004 content boundary at 1920 px | **PASS** — no horizontal overflow |
| 8 | BL-CHK-006 cart totals | **PASS** — 260.00 − 0.00 + 0.00 + 52.00 = 312.00 |
| 9 | Adjacent surface: pagination, modals, cart page | **PASS** |
| 10 | End state restored | **PASS** — cart cleared via UI; mission fixtures untouched (progress is order-derived) |

"Add to cart" is correctly `disabled` at qty 0 and when modal quantity already equals cart quantity — validation working, never forced.

## Observation (not a defect)

10 s is long for a purely confirmatory toast (4–5 s is the more common norm), and it anchors top-right where it **covers the header nav and cart badge for the full duration**. It does not block interaction — the page underneath stays clickable.

## Not filed (below severity floor)

- **Low** · pre-existing · `AGENT-TEST Missions PerSku Target A/B` fixture products carry no images; broken placeholders render in the SKU modal and cart lines. Test-data gap, not a product defect → `test-data-engineer`.

## Coverage gap

No regression case covers toast auto-dismiss. `verify-fix` authors none — route in is `/qa-test-lifecycle`.
