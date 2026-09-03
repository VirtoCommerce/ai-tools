# VCST-5514 — Verification Report `VERIFIED`

**Ticket:** VcSelect button focus issue · Bug · Medium · Sprint 26-15
**Check type:** Fix verification (RED→GREEN) · **Verdict: VERIFIED**
**Env:** vcst-qa @ storefront `2.55.0-pr-2411-b7e6-b7e60370` (fix build, confirmed live via footer + `vcst-qa` branch pin)
**Date:** 2026-08-04 · **Agent:** qa-frontend-expert (playwright-chrome) · run inline

## Summary
PR [vc-frontend#2411](https://github.com/VirtoCommerce/vc-frontend/pull/2411) fixes the focus/layout of the `VcSelect` dropdown toggle and the focus ring of `VcMenuItem`. Verified live on the fixed build via read-only computed-style measurement of the Sort-by control on `/search`. The toggle chevron is now the shared `VcButton` (ghost neutral) and menu-item focus rings correctly follow each item's inherited corner radius. STR passed 3/3; sort selection and dropdown open/close unaffected; no new console errors.

## Deployment gate
- Fix NOT deployed at session start (live was `2.55.0-pr-2407`); operator deployed the `2411` artifact mid-session.
- Confirmed authoritatively before Phase B: live footer = `Ver. 2.55.0-pr-2411-b7e6-b7e60370`; `vc-deploy-dev@vcst-qa` `theme/artifact.json` pins the `2411` package. (Deploy PR #6266 still open — the branch already carries the pin.)

## Fix vs. root cause (both aspects confirmed)
| Aspect | PR change | Live measurement (fixed build) |
|---|---|---|
| Dropdown toggle | raw `<button>` → `VcButton` ghost neutral | `class="vc-button … vc-button--ghost--neutral vc-button--icon vc-select__arrow"`, focus ring 3px, radius 6px, 32×32 |
| Menu-item focus (rounded item) | `-outline-offset-2` + `rounded-[inherit]` | offset **-2px**, radius **8px 8px 0 0** (top item), focus-visible |
| Menu-item focus (square item) | same rule, inherited radius | offset **-2px**, radius **0px** (middle item), focus-visible |

## Verification checklist (10/10 PASS)
Fix confirmation
1. STR reproduced on fixed build (focus VcSelect toggle + menu items) — **PASS**
2. Reported focus issue resolved — **PASS**
3. Root cause addressed (element swap + inherited-radius focus ring, not a symptom patch) — **PASS**

Regression
4. Sort selection works — Enter on "Alphabetically, A-Z" → `?sort=name-ascending`, combobox value persists — **PASS**
5. Dropdown open/close (toggle click, Escape, keyboard Arrow/Enter) — **PASS**
6. No new console errors — **PASS** (4 errors all unrelated: 2× demo-catalog image 404 `starmarket-platform.demo.govirto.com`, 2× GA `413`)

Cross-layer (frontend)
7. Storefront reflects corrected behavior on live 2411 — **PASS**
8. API/back-end — **N/A** (pure UI-kit styling/structure change)

Edge / business rules
9. Focus ring inherits per-item corner radius (top rounded vs middle square) — **PASS**
10. BL-UI-007 (keyboard operable + visible focus state) — **PASS** (`:focus-visible` ring renders on keyboard nav; 2px/3px solid outline)

## STR — 3 consecutive runs
| Run | Item | outline-width | outline-offset | border-radius | focus-visible |
|---|---|---|---|---|---|
| 1 | Featured (top) | 2px | -2px | 8px 8px 0 0 | ✔ |
| 1 | Alphabetically A-Z (mid) | 2px | -2px | 0 | ✔ |
| 2 | Featured (top) | 2px | -2px | 8px 8px 0 0 | ✔ |
| 3 | Alphabetically A-Z (mid) | 2px | -2px | 0 | ✔ |
Deterministic and identical across runs.

## Baseline (RED)
Fix was already deploying when picked up, so no fresh live RED. Baseline taken from: reporter's ticket screenshots + the prior QA run's `BEFORE-*` captures (env on pre-fix `2407`), and the pre-fix live env was directly observed on `2407` at session start before the deploy. RED not fabricated.

## Evidence
- `reports/tickets/VCST-5514/evidence.html` (RED→GREEN page)
- Screenshots: `screenshots/VCST-5514-{BEFORE,AFTER}-*.png`, `screenshots/VCST-5514-GREEN-*.png`
