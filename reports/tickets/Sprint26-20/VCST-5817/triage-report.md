# Triage — VCST-5817 (checklist + C1 `REG-2026-10-09-1616`)

**Date:** 2026-10-09 · **Env:** http://localhost = vc-frontend PR #2522 `2.60.0-pr-2522-6f90-6f902c9e` (API vcst-qa, B2B-store) · **Control build:** https://vcst-qa-storefront.govirto.com `3.0.0-alpha.2685` (no PR #2522)
**Inputs:** checklist rows (ticket mode, 6 issues, 5 advisory, 0 unresulted) + C1 (12 cases: 6 PASS / 5 FAIL / 1 BLOCKED) · **Real bugs:** 5 distinct · **Test defects:** 2 · **Dismissed:** 1
**Note:** `vc-fix:qa-investigate` is user-invocation-only — provenance was settled by plain A/B control runs, not its package. The formal package before `/vc-fix:qa-bug` is the operator's `/vc-fix:qa-investigate`.

## Confirmed real bugs

| # | Finding | Evidence (cases / rows) | Provenance | Severity | Package / draft |
|---|---|---|---|---|---|
| R1 | Search input still moves at the loader→chip hand-over: the loader resizes to the NEW label 2–3 ms before the chip mounts; 14.89–31.36 px on live labels, **−354.97 px** for a 128-char label at 1920 (BL-UI-003) | A3 · C1 SRCH-011/024/026/027 · 3x item 1 · 4v O-1 | **IN-SCOPE** — the ticket's own unmet expectation (PR "Known limit a"; no max-width on the chip) | Medium (P2) | `reports/bugs/open/medium/BUG-Search-Bar-Scope-Chip-Layout-Shift.md` (VCST-5817 itself) — **no new ticket** |
| R2 | Leaving a category before `GetCategory` returns rewrites the URL (`history.replaceState`) to that category while cart / global search stays rendered; reload and Back open the wrong page (19 vs 9/11 results) | D1 · 4a · A/B | **PRE-EXISTING** — reproduces on control (`category.vue:781` dev@1850afa6, no cancel guard) | Medium (P2) | `evidence/D1-stale-category-url-rewrite/` (agent-built, not qa-investigate) |
| R3 | Focus drops to `<body>` after removing the header scope chip (mouse and keyboard) — BL-A11Y-001 / WCAG 2.4.3 | B10 · C1 SRCH-032 · A/B | **PRE-EXISTING** — control identical (`search-bar.vue:174-176` dev) | Medium (P2) — same pattern as VCST-6198 | screenshots `B10-ab-*.png` |
| R4 | First category entry: slot grows 0 → 80 → 94.89 px, input +98.89 px | B11 | PRE-EXISTING (PR limit c) | Low | `reports/bugs/open/low/BUG-Search-Bar-Scope-Slot-Grows-From-Zero-On-First-Category-Entry.md` |
| R5 | "All products" trigger narrows 134→122 px on first load; nav/divider shift 12 px | B12 | OUT-OF-SCOPE, PRE-EXISTING | Low | `reports/bugs/open/low/BUG-storefront-mega-menu-all-products-button-narrows-on-first-load.md` |

## Test-case fixes (recommended, not applied — `/qa-review-tests file 004 --fix`)

| Case | Class | Fix |
|---|---|---|
| SRCH-025 (BLOCKED) | TEST_DATA_DEFECT | No live parent/child pair whose chips both settle at 5rem (Tyres 80.22 / child 142.90). Use a sibling pair via history (e.g. Lg ↔ Sony under Televisions) or seed a short-label parent/child pair via `/qa-generate-data` |
| SRCH-031 (PASS) | TEST_STEPS_DEFECT (mechanic) | The op to delay is `GetCategory`, not `GetSlugInfo` (Apollo-cached on a breadcrumb back); click → type → Enter must run inside one Playwright call to land inside the pending window |

## Dismissed

| Item | Class | Reason |
|---|---|---|
| D2 raw `common.labels.close` on the mobile search backdrop | KNOWN_ISSUE | VCST-6097 (`reports/bugs/open/medium/BUG-storefront-mobile-search-overlay-unnamed-controls-small-cancel.md`) |

Advisory (counted, not triaged): A5 AC-2 drift · B15 mobile has no scope chip (PO) · D3 duplicate `GetCategory` per arrival · D4 placeholder changes 3× per navigation · D5 footer removed under the matcher loader (WAIVED, outside surface). App Insights: skipped — no `APPINSIGHTS_*` API key configured.

**No tracker ticket filed, no fix triggered — human decides.**
