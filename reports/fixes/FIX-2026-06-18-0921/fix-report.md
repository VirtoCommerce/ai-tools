# FIX-2026-06-18-0921 — VCST-5276

**Ticket:** VCST-5276 — Pricing/Export "Select data to export" toolbar overlaps the grid column header
**Repo / kind:** VirtoCommerce/vc-module-export · `module` (Admin SPA layout/CSS)
**Branch / PR:** `claude/qa-autofix/VCST-5276` → **PR #101** (open, MERGEABLE, label *needs deploy verification*)
**Status:** PR open for human review — **not merged** (G7). JIRA awaiting *In Progress → In Review* (pending user OK).

## Fix
Move the Important! note out of the fixed-height (70px) `blade-static` toolbar into `blade-content` above the grid; `blade-static` keeps only the single-row `searchrow`. Diff: **+1 / −3** lines in `export-generic-viewer.tpl.html`. No inline `position`/fixed-px/`ng-style`; platform classes only; matches the canonical `pricelist-list` sibling.

## Root cause
PR #101 had removed the absolute-positioning hacks but **deleted the height reservation**, leaving the note stacked above the searchrow inside `blade-static`. The platform rule `.blade-static .form-group:only-child { height:100% }` (`vc-platform/_base-modules.sass`) forces the note's toolbar container to stretch to the full fixed height — so note + searchrow can never fit, and the searchrow overflowed ~65px onto the ui-grid header. `__expanded` (fixed 114px) does not solve it. No org-wide precedent exists for a note inside a `blade-static` toolbar → the note belongs in content.

## Gate results
| Gate | Result |
|------|--------|
| G0 triage | PASS — simple, localized, non-breaking CSS template fix |
| G1 repo route | PASS — single repo `vc-module-export` (module) |
| G2 reproduce (red) | PASS — live geometry: searchrow↔grid-header overlap **+65px** |
| G3 fix (green) | PASS — live DOM-applied relayout → **0 overlap** (note above grid, searchrow alone in toolbar); harness reference-validation vs `pricelist-list` (0px) |
| G4 review | PASS — backend-reviewer APPROVE (single file, no test edits, no anti-patterns, BL-UI preserved) |
| G5 CI | `ci` PASS, SonarCloud QG PASS, license/cla PASS; `auto-tests` postgres PASS (mysql/sqlserver completing) |
| G6 E2E | Deferred — *needs deploy verification* label; final confirmation once alpha artifact deploys to QA |
| G7 human review | PR open, **never merged** |

## Evidence (live, vcst-qa @ Platform 3.1038.0)
- `reports/bugs/screenshots/VCST-5276-live-before.png` — broken (note in toolbar, search over grid header)
- `reports/bugs/screenshots/VCST-5276-live-optionA-final.png` — fixed (note above grid, 0 overlap)
- `reports/bugs/screenshots/VCST-5276-live-optionB-note-above-search.png` — rejected alt (note-above-search: stretched + 5–65px overlap)

## Spin-off
**VCST-5295** (Task, `vc-platform`, linked *Relates* to VCST-5276) — platform CSS enhancement so a note can render *above* a search toolbar without the `form-group:only-child` stretch (the "note above search" layout, impossible cleanly today).

## Bug report
`reports/bugs/open/BUG-pricing-export-select-data-layout-VCST-5276.md`
