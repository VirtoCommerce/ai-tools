# VCST-5862 — Fix Verification: BLOCKED (framework half not deployed)

**Ticket:** [vc-shell] 25 colour-contrast violations in the Light theme; user role label at 2.41:1 (WCAG 1.4.3) · Bug · Medium
**Env:** vcmp-dev Vendor Portal — app `2.1.2-rc.0`, asset build `42234` (2026-09-07 11:14:10 GMT), framework `2.6.0-rc.0`, Chrome
**Fix:** two halves — `vc-shell` PR #356 `477cb529` (framework) **+** `vendor-portal` PR #154 `2a192845` (app), both merged 2026-09-04
**Re-run:** 2026-09-07, widened to the dev's own scope (4 routes × Light **and** Dark) after reading Maksim Zinchuk's fix comment

## Verdict

**BLOCKED — not REOPEN.** The dev's own comment already said so: *"Not released yet — this is on `main` and on
the portal's `dev`."* This run **confirms and quantifies** that rather than discovering it: which half is
live, what is pinning the other, and a complete pre-fix baseline. Status stays at *Ready for test*.

## Deploy gate — SPLIT, unchanged on re-check

| Half | Deployed | Evidence |
|---|---|---|
| **Framework** (#356) | **NO** | Marker `--environment-banner-text-color` → **0 hits** in `assets/index42234.css`; reverse control `--environment-banner-color` → **8 hits** (instrument live, so 0 = absent). Ancestry `477cb529...cb6379d` = `behind_by 4`. Third confirmation from the live console banner: `@vc-shell/framework v2.6.0-rc.0 · 2026-09-02T10:20:14Z · 9cf874d09` — built two days *before* the fix merged. |
| **App** (#154) | **YES** | `tw-py-10 tw-text-[var(--neutrals-500)]` → **3 hits** in `index42234.js`; old `--neutrals-400` form → **0**. |

`vendor-portal@dev` pins `"@vc-shell/framework": "2.6.0-rc.0"` **exactly**, so no app rebuild can pick #356
up. Re-checked at 12:18 GMT: no non-PR framework release since 2.6.0-rc.0; npm `latest` still `2.5.0`.

## RED baseline — the dev's full scope (axe-core 4.10.2, `color-contrast`)

| Route | Light | Dark |
|---|---|---|
| `#/` | 4 | 1 |
| `#/products` | 18 | 16 |
| `#/orders` | 17 | 15 |
| `#/offers` | 19 | 17 |
| **total nodes** | **58** | **49** |

Node counts are **row-count dependent** (`.vc-table-cell-date-ago` repeats per table row), which is why
these exceed the dev's before-figures of 23/16 — the same measurement on differently-populated tables.
The stable unit is the distinct signature, matching the dev's own *"a few elements repeated, not 25 places"*:

| Signature | Light | Dark | Fixed by |
|---|---|---|---|
| `.vc-user-info__role` | 2.41:1 | 3.40:1 | #356 `user-info.vue` |
| `.vc-environment-banner__label` | 2.79:1 | not flagged | #356 `vc-environment-banner.vue` |
| `.vc-data-table__header-title-text` (sorted) | 4.40:1 | not flagged | #356 `TableHead.vue` |
| `.vc-table-cell-date-ago` | 2.52:1 | 3.16 / 2.83:1 | #356 `CellDateAgo.vue` |
| `.vc-blade-toolbar-base-button__title` ("Delete selected") | 2.41:1 | 3.40:1 | **#355 — see below, not a contrast defect** |
| `.dashboard-stat-item__value--success` | 4.13:1 | not flagged | **neither PR** |

All four files #356 touches map to a measured signature, and the sorted-header 4.40:1 matches the dev's
own 4.41:1 for `--primary-700`. The diagnosis is right and simply not shipped.

## "Delete selected" is NOT a VCST-5862 defect — it belongs to VCST-5861

The ticket lists *"the 'Delete selected' toolbar title"* as an affected element. Measured against the dev's
rationale (*"`--neutrals-400` was left alone wherever it marks a disabled or inactive control — WCAG 1.4.3
exempts those"*), that attribution is wrong, and a controlled pair on the same page proves it:

| Control | Ink | Exposes disabled? | axe |
|---|---|---|---|
| Pagination buttons | `#a3a3a3` on `#f5f5f5` (~2.3:1 — *worse*) | yes, `disabled` attr | **not flagged** |
| "Delete selected" | `#a3a3a3`, `tabIndex 0` | **no** — neither `disabled` nor `aria-disabled` | **flagged** |

Same token, same ink; the only difference is whether the state is exposed. So axe's 1.4.3 exemption is
live in this build, and this node appears **only because VCST-5861 leaves the control unexposed**.

Two consequences: #356 correctly does not touch it, and **VCST-5861's fix will remove it from this
ticket's count with no colour change**. The dev's *"after: 0"* is therefore only reachable with **both**
#355 and #356 — consistent, since both sit in the same unreleased framework, but it means these two
tickets must be re-verified **together**.

## Predicted post-deploy residual — one signature will survive

`.dashboard-stat-item__value--success` measures **4.13:1** (`#43875f` on `#fafafa`, 18px normal → AA needs
4.5:1), Light only, on the products and offers widgets. #356 does not touch it and #154 changed
empty-state ink rather than stat values, so it is expected to remain after the deploy — which would make
*"after: 0"* not hold. It renders only when a widget carries a success stat, so the dev's clean run may
simply have had different data. **Not filed:** re-measure post-deploy; if real it is its own Medium a11y
ticket, not a blocker here.

## Limits

- **Green theme not audited** — unknown, not clean. Light and Dark both covered this run.
- **No AT pass was run** — contrast is a computed-style measurement.
- The app half (#154) is proven deployed at **bundle level only**: the empty state never rendered, because
  both widgets held data.
- **Nothing in CI protects this once fixed** — the dev notes the story-level axe gate has `color-contrast`
  disabled as a documented exception, and no `config/test-suites.json` suite covers vc-shell.
- Incidental, dismissed: three catalog image 404s in console — env data drift, not a code defect.

## Next

Publish a framework release containing #356 **and** #355, bump the vendor-portal pin, redeploy vcmp-dev,
then re-run the matrix above in Light and Dark and re-measure the dashboard stat value.

## Evidence

`screenshots/VCST-5862-RED-dashboard-contrast.png`

---

# 2026-09-15 — Phase B (GREEN): **PASS**, one predicted residual survives

**Env:** build `53555`, framework `2.6.0-rc.1`, Chrome/`playwright-chrome`, axe-core **4.12.1** rule `color-contrast`, Light + Dark. RED baseline above — cited, not re-derived. **Nodes 58 → 2 (Light), 49 → 1 (Dark)**; per route Light `#/` 2 · products/orders/offers 0, Dark 0/1/0/0. Counts vary with blade-stack depth and row state — the **signature list is the verdict**.

| Signature (#356) | RED L/D | GREEN L/D | Renders | ≥4.5:1 |
|---|---|---|---|---|
| `.vc-user-info__role` "Administrator" | 2.41 / 3.40 | **4.54 / 5.09** | yes | yes (L margin only +0.04) |
| `.vc-environment-banner__label` "Development" | 2.79 / not flagged | **7.51 / 8.27** | yes | yes |
| `.vc-data-table__header-title-text` sorted ("Created Date") | 4.40 / not flagged | **5.75 / 8.96** | yes | yes |
| `.vc-table-cell-date-ago` "1 day ago" | 2.52 / 3.16 | **7.81 / 5.76** | yes | yes |

All four confirmed **on screen** (screenshots), so none "passes" by having vanished. **Banner variant:** vcmp-dev renders the **coloured `--success`** variant — the fixed-black-ink path (`--environment-banner-text-color:#000000`), not theme-following `neutral`: `#000` on `#57ab79` (L) = 7.51:1, on `#3fb950` (D) = 8.27:1.

**OPEN QUESTION — measured, not predicted: axe treats `aria-disabled` exactly as native `disabled`.** `.vc-blade-toolbar-base-button__title` ("Delete selected") is **gone from the violation list** (0 nodes, 3/3 runs, both themes) **with no colour change** — ink is still `#a3a3a3` on `#fafafa` = **2.42:1** L (RED 2.41) and `#6e7681` = **3.41:1** D (RED 3.40). Scoped `axe.run('.vc-blade-toolbar')` → `violations=0 passes=4`: exactly the 4 actionable buttons (7.49 L / 6.21 D); the 5th is **excluded — neither pass nor violation**. **Control pair, like-for-like:** the pagination buttons carry the same muted ink at a *worse* **2.31:1** L / **3.16:1** D and are likewise excluded (`violations=0 passes=4 incomplete=1`) — but they are natively `<button disabled>` while the toolbar control is `aria-disabled` only. Same exclusion reached from two different mechanisms ⇒ VCST-5861's fix removed this node as predicted, and #356 was right to leave the colour alone.

**PREDICTED RESIDUAL — CONFIRMED, survives; not a blocker for either ticket.** `.dashboard-stat-item__value--success` at **4.13:1** (`#43875f` on `#fafafa`, 18px normal, needs 4.5:1), **Light only, 2 nodes on `#/`**, identical in 3/3 runs — visible as "59 Published" (Products widget) and "19 Enabled" (Offers widget). Touched by neither PR → **standalone Medium / P2 candidate, its own ticket, never a Sub-task.**

**New residual signatures (neither PR; reported, not filed):** `.vc-gallery__dnd-hint` **1.65:1** L / 3.62 D · `.vc-gallery__upload-btn` **2.77:1** L / 4.11 D · `.vc-select__selected-item` **3.07:1** L / 4.23 D · `.vc-label__language` 4.34:1 L — all on the **product-detail blade**, a surface the RED sweep never scanned. Plus `.vc-hint` 3.93:1 L / 4.22:1 D, which flags **only on the highlighted-row background** (why it appears in one run and not the next).

**Limits.** **No AT pass was run** — computed-style + axe measurement, never screen-reader output. **Green theme not audited — unknown, not clean.** **BL-A11Y-003** is cited for the WCAG 1.4.3 criterion only: written *"on the accessibility-gated storefront themes"*, it is storefront-scoped by its own wording, not a vc-shell conformance target.

**Evidence.** `screenshots/VCST-5862-GREEN-products-signatures-{light,dark}.png` · `screenshots/VCST-5862-GREEN-dashboard-residual-light.png` · HAR `test-results/chrome/har/session.har`
