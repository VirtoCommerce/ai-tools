# FIX-2026-10-20-1530: VCST-6142, completed-mission check below 3:1

**Ticket:** VCST-6142 (Bug, Medium) → **In review** · **PR:** [vc-frontend #2590](https://github.com/VirtoCommerce/vc-frontend/pull/2590) (base `dev`, OPEN, not merged)
**Repo / kind:** `VirtoCommerce/vc-frontend` / `frontend` · **Branch:** `claude/qa-autofix/VCST-6142` · **Commit:** `0ffa9dc7`
**Bug report:** `reports/bugs/open/medium/BUG-missions-completed-check-contrast-below-3-1.md` · **Oracle:** BL-A11Y-003 (WCAG 2.2 SC 1.4.11)

## Root cause
The 56 px `circle-check` sits on a translucent success scrim, so its contrast depends on the banner art behind it. #2548 (VCST-6145) already shipped the designed `success-600 @ 55%`, which the report suggested as the fix. It does not fix the bug: on `dev` the worst case across the 14 presets is still **2.26:1** in light and **1.76:1** in dark, and default.dark and mercury.dark fail over the bare banner (2.38:1).

## Fix
`mission-card.vue`: the glyph is wrapped in `.mission-card__check`, an opaque 64 px `bg-success-600` disc. The worst case becomes **3.74:1** (default.dark, mercury.dark) and is ≥5.18:1 everywhere else. The scrim and `aria-hidden` are kept. This deviates from the scrim-only design, so the designer needs to sign off. `success-700` (≥7.18:1) is a one-token alternative.

## Gates
| Gate | Result |
|---|---|
| G0 triage | PASS: CSS-only, one file, non-breaking, still reproducible after #2548 |
| G1 route | PASS: vc-frontend, anchor `.mission-card__done` confirmed on `dev` |
| G2 repro | RED: new `mission-card-done.test.ts` (glyph not on a disc) |
| G3 fix | GREEN: loyalty specs 4/4, `vue-tsc --build` and eslint clean; existing tests untouched |
| G4 review | APPROVE (frontend-reviewer). Note: the DOM wrapper change is called out in the PR for theme forks |
| G5 CI | PASS: all checks green incl. auto-tests (6 DB/search combos), Sonar QG. Run 1 red on an unrelated sales-rep date test (fixed on dev by #2589; branch updated). Run 2 red only in "Push Build Info to Jira": the action parsed `Y-003` from `BL-A11Y-003` in the PR body as an issue key; body reworded, job re-run green |
| G6 E2E | not run here (by design). Label `needs deploy verification` does not exist in the repo, so the PR body carries the section instead. Next: `/qa-verify-fix VCST-6142` |
| G7 | STOP at In review; no merge |

## Notes
- Local Node 22.22.0 is below the repo's engines requirement (≥22.22.1). The developer agent used a checksum-verified Node 22.22.1 from nodejs.org in a temp folder to pass the pre-commit hook. No `--no-verify`; system Node untouched.
