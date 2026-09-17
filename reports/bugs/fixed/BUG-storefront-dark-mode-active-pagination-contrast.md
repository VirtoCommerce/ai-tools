# Dark mode: the active pagination page number renders at **4.37:1** — just under the AA text minimum — **P3**

## Status: FIXED
**Found by:** `/qa-design VCST-5346` (2026-08-28)
**Tracker:** VCST-5838 (standalone Bug)
**Archetype:** `RENDER`

**Env:** vcst-qa @ Theme `2.57.0-pr-2396-5924`, store `B2B-store`, preset **Red**, **dark mode** (`html.dark`), chrome. Shared `vc-pagination` — reproduces anywhere the component paginates, not only on missions.

## Summary
`vc-pagination__page--active` renders `#0a0a0a` text on a `#d34247` fill in dark mode: **4.37:1**, against the 4.5:1 WCAG 1.4.3 minimum for normal-size text. Light mode passes (4.59:1) — the dark fill is the regression, and it is the same `#d34247` that `--color-primary-500` and `--color-danger-500` both resolve to in dark (see the token-collision report).

## STR
1. Sign in, go to `/account/missions` (13 seeded missions ⇒ 2 pages).
2. Switch to dark mode.
3. Measure the contrast of the active page number against its own fill.

## Expected vs Actual
- **Expected:** ≥ 4.5:1 (normal text, AA).
- **Actual:** 4.37:1.

## Recommended fix
Lighten the active-page text to white, or darken the active fill in the dark palette. A white foreground on `#d34247` clears the criterion comfortably.

## Notes
Marginal but deterministic — it is a fixed token pair, not content-dependent, so it fails identically for every user in dark mode. Found while auditing missions; the owner is the shared UI kit.

Reaching dark mode required a keyboard workaround: the QA environment badge (`z-index 21`) sits over the 20 × 20 dark-mode toggle and intercepts the click. That is an environment-only affordance, reported separately in the audit, not a product defect.

## Refs
`WCAG 1.4.3` · `PROPOSED-BL-UI-008` · full audit: `reports/tickets/Sprint26-17/VCST-5346/design-report.md` (N8)


---

---

## Resolution

**Fixed in:** vc-frontend PR #2478 @ `e8f6a9d7` — theme build `vc-theme-b2b-vue-2.58.0-pr-2478-e8f6-e8f6a9d7`
**Tracker:** VCST-5838 — transitioned to `Tested` 2026-09-15
**Verified:** 2026-09-15 via `/qa-test` → `verify-fix` (qa-frontend-expert, playwright-edge)
**Method:** WCAG 2.x ratio computed from live `getComputedStyle()` color/backgroundColor — no value transcribed. Harness self-checked against this report's own 4.37 baseline on every load.

| Preset | Mode | text | fill | ratio |
|---|---|---|---|---|
| Red | dark | rgb(10,10,10) | rgb(255,149,146) | **9.40** |
| Red | light | rgb(255,255,255) | rgb(229,33,33) | 4.59 |
| Coffee | dark | rgb(17,15,14) | rgb(194,163,150) | **8.17** |
| Coffee | light | rgb(255,255,255) | rgb(153,108,90) | 4.52 |

Dark measured 3 consecutive independent loads per preset. Both WCAG-gated presets pass in both modes against **BL-A11Y-003** — the shipped invariant; this report's `PROPOSED-BL-UI-008` never landed. Confirmed on two surfaces with identical results: `/company/members` and `/account/missions` (this report's own STR path).

**Root cause addressed:** `--page-active-bg` resolves to `--color-primary-700` only under `html.dark`; in dark both gated ramps invert to a light tint (`#ff9592` red, `#c2a396` coffee) against the near-black ink, which is why the fill changed rather than the ink.

**Carried forward (not defects):**
- Coffee light clears AA by **0.02** (4.52 vs 4.50). Unchanged by this PR and equally thin before it, but fragile to any future shift in `--color-additional-50` or coffee's primary-500.
- **Ellipsis unverified:** the PR drops `text-neutral-400` from `.vc-pagination__page--ellipsis`, which only renders at ≥10 pages; no reachable surface exceeded 5. Static analysis of the deployed bundle suggests its colour now comes by inheritance rather than a token (it is a `<span>` with no `type` attribute, while the only base colour rule is `[type=button]`-scoped). Falsifiable in one measurement on a ≥10-page surface.

**Evidence:** `reports/tickets/Sprint26-18/VCST-5838/` — `verification-report.md`, `verification-summary.json`, 6 screenshots.
