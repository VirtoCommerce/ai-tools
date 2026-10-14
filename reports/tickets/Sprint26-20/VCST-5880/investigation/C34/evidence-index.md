# C34 — Evidence index: keyboard focus lost when a compare row is pinned or unpinned

**Verdict:** REPRODUCED. BASELINE: 6/6 actions (3 pin + 3 unpin). PR: 6/6. PRE-EXISTING and OUT-OF-SCOPE for VCST-5880. **Scope: compare-only.** The cause is local to `compare-table.vue`. Focus dropping to `<body>` after an action is a recurring storefront *pattern* (KB-21C241D2, KB-1AC3D57E), but each instance has its own code path.

**Env:** TEST_ENV=vcst (`vcst_qa`), guest, Edge via playwright-edge, 1280x900, 2026-10-12. Builds and data are the same as in `../C23b/evidence-index.md`: 3 products in Group A. Layer: storefront Vue render only. No server call is made, because a pin is local UI state.

## STR
1. As a guest, add `@td(PROD_CMP_A)`, `@td(PROD_CMP_B)`, `@td(PROD_LONGNAME)` (+ `@td(PROD_CMP_C)`) to compare.
2. Open `/compare` at 1280 px.
3. Click the non-interactive row label "AgentTestCompareFlag" (or "SKU"), then press **Tab**. Focus moves to `Pin "AgentTestCompareFlag"` (`aria-pressed=false`).
4. Press **Enter**. The row moves to the top as pinned.
5. Expected: focus stays on the same button, now named `Unpin "AgentTestCompareFlag"`. Actual: `document.activeElement` is `<body>`, both immediately and after 500 ms. No focus ring shows anywhere.
6. Repeat steps 3–4 on the pinned row (Unpin). The row moves back down and focus again drops to `<body>`.

## Results (`document.activeElement`)
| Build | Row | Action | Before Enter | Immediately after | +500 ms | Top rows after |
|---|---|---|---|---|---|---|
| BASE | AgentTestCompareFlag | pin | BUTTON Pin, pressed=false | BODY | BODY | Flag / Price / Availability |
| BASE | AgentTestCompareFlag | unpin | BUTTON Unpin, pressed=true | BODY | BODY | Price / Availability / SKU |
| BASE | SKU | pin | BUTTON Pin | BODY | BODY | SKU / Price / Availability |
| BASE | SKU | unpin | BUTTON Unpin | BODY | BODY | Price / Availability / SKU |
| BASE | AgentTestCompareFlag | pin, then unpin (3rd attempt) | BUTTON | BODY / BODY | BODY / BODY | as above |
| PR | same 3 × (pin, unpin) | — | BUTTON | **BODY ×6** | **BODY ×6** | identical row order |
| BASE + PR | **Control:** Price per unit (already first) | pin, then unpin | BUTTON | focus **kept**: `Unpin "Price per unit"` / `Pin "Price per unit"` | kept | unchanged |

After the loss, the next **Tab** goes to `Pin "Min. order qty"`, the row that followed the moved row's old slot. Chromium keeps the sequential-navigation start point, so the keyboard user is not sent to the page top. But the visible focus and the screen-reader context are gone, and the user is no longer on the control they activated.

## Artifacts
- `../../screenshots/inv-base-1280-pin-focus-lost.png`: BASELINE. AgentTestCompareFlag is pinned at the top and no element shows a focus ring.
- `../../screenshots/inv-pr-1280-pin-focus-lost.png`: PR, same state.
- `../../screenshots/inv-pr-1280-compare-header.png`: control state. The focus ring stays on the "Price per unit" pin button after Enter.
- `console-session.txt`: whole-session console. Only fixture image 404s; no JS error on pin/unpin.

## kb
- `KB-E0DCEFC0` **captured** (BASELINE observation plus the control).
