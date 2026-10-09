# VCST-6214 — Step 4v design / a11y / UX report (Chrome DevTools MCP, minted account)

Target: vcst-qa storefront `{{FRONT_URL}}`, footer "Ver. 3.0.0-alpha.2685" (vc-frontend-next, **Paprika** preset), Light and Dark (`html.dark`). Viewports 1920x1080 and 375x812 (mobile + touch emulation). Account minted through `/sign-up` (`AGENT-TEST-…-v6214b@qa.test`; lists created and deleted, account left for the teardown sweep). Coffee/Red presets NOT measured — Paprika is not a gated theme, so every a11y verdict below is indicative (checklist G2).

## Axis verdicts

| Axis | Verdict | Evidence |
|---|---|---|
| vs. DESIGN | `SKIPPED — no design link` (the ticket carries no Prototype / Claude Design link; no global default) | — |
| BL-UI-001 layout stability | **FAIL** | Barcode empty state CLS 0.41 @1920 (light 0.4099 ×2, dark 0.4109), 0.76 @375 — one late shift, `footer.app-footer` 0 → 778 px. `/catalog` 0.07, lists 0.02. **5-triage: PRE-EXISTING upstream** (vcptcore-qa 2.59.0-pr-2458 equal or worse), also on keyword zero-hit → findings G1 |
| BL-UI-002 spacing | INCONCLUSIVE — not run | — |
| BL-UI-003 state shift | PASS (list-card hover only) | hover rect unchanged; preferences menu and other states not measured |
| BL-UI-004 content boundary | PASS | `scrollWidth` = viewport at 1920 and 375 on every tested page |
| BL-UI-005 alignment | INCONCLUSIVE — not run | — |
| BL-UI-006 touch targets | PASS (AA) + advisory | 13 targets @375, none < 24 px (bell exactly 24x24); 8 px gaps missing (menu→logo 0, search→bell 4, bell→cart 4, footer links 2) → findings I9 |
| A11y — BL-A11Y-001 keyboard | **FAIL** (mobile menu) | Desktop order logical, ring 2 px #2a6ba3 / #8ebeec dark, Esc returns focus. Mobile main menu does not contain focus → I3 |
| A11y — BL-A11Y-002 naming | **FAIL** (mobile bell) / PASS (language options) | C1/C2: one accessible name per language option, flags `alt=""`. Mobile bell named only by its count → I4. Mobile list: two options both "English" → C2a |
| A11y — BL-A11Y-003 contrast | **FAIL** | white on `#e5451c` 4.04:1 (light) → I1; preferences titles 3.2:1 → I2; dark empty-hint 4.14:1 → I6. D6 outline/ghost buttons PASS (outline--primary light hover 4.49:1, 0.01 under — marginal WARN) |
| A11y — BL-A11Y-004 status | **FAIL** | list-details qty `min=1 max=0` → `invalid=true` on an untouched render → I5 |
| axe-core | 1 serious per page (header badge 4.03) · home `image-alt` ×9 → I8 | |

## Row verdicts (checklist)

C1 PASS · C2 PASS (advisory: two options both named "English"; no `aria-current` on mobile) · C4 MANUAL (screen reader) · D1 surface is cards, not a `vc-table` → row corrected to N/A, #2532 verified via D2 (+ return-wizard re-check, 4a) · D6 PASS · G1 FAIL (BL-UI-001) · G2 theme note.

## UX notes / advisory

- Barcode empty state copy talks about filters on a page that has none ("Loosen one of them…" + **Reset filters**; upstream "Reset search") → I10.
- Dark-mode store logo is a different image from light (store content, brand inconsistency).
- No hover affordance on light wishlist cards / line items; ghost--neutral hover in dark equals the card fill (no visible feedback).
- Un-reproduced: one keyboard walk landed on "Reset filters" and navigated to `/catalog` without Enter; three later walks did not repeat it — INCONCLUSIVE, not filed.

## Not covered (stated)

Coffee/Red presets · BL-UI-002/005 · real screen-reader output (C4) · WCAG 3.3.8 / 2.5.7.

_Restored 2026-10-09 after a local deletion; the 4v screenshots it cited (`4v-*`) were lost except those attached to the ticket._
