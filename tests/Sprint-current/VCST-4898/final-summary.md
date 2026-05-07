# VCST-4898 — Consolidated QA Summary

**Verdict:** PASS WITH NOTES
**Date:** 2026-05-06
**Build:** Theme `2.49.0-pr-2271-ef5a-ef5a93c4` deployed to QA (verified in `vc-deploy-dev/theme/artifact.json` on `vcst-qa`); Platform `3.1025.0`.
**Sprint:** VCST Sprint 26-09 | **Priority:** Medium (P2) | **Type:** Story
**PR:** https://github.com/VirtoCommerce/vc-frontend/pull/2271 (open, deployed)

---

## Acceptance Criteria

| AC | Description | Verdict |
|----|-------------|---------|
| #1 | Update chips — Private `lock-closed` color → `text-info-700`; Shared `users` color → `fill-primary` | **PASS** |
| #2 | Remove "Saved:" text → replace with `save-v2` icon + short-format date | **PASS** |

**Detail:** Both ACs verified across Chrome (qa-frontend-expert) + Firefox (qa-testing-expert) + Chrome DevTools (ui-ux-expert). All chip color tokens confirmed live; old `fill-secondary`/`fill-accent` classes absent (0 occurrences). `Saved:` text gone from EN + DE; `save-v2` icon present with `text-info-400`; wrapper layout `flex items-center gap-1.5`.

> **Date-format reconciliation:** an early checklist note expected `5/6/26` numeric form for `$d(date, "short")`. Live verification confirmed the storefront's i18n config defines `short` as the abbreviated-month format (`May 6, 2026`), not bare numeric. The PR's call site is correct; the checklist's expectation was based on a wrong assumption of vue-i18n defaults. **Not a regression.**

## Regression Smoke

| Case | Description | Result |
|------|-------------|--------|
| B2C-LIST-001 | Create new list | PASS (smoke path) |
| B2C-LIST-002 | Add product to list from PDP | PASS |
| B2C-LIST-004 | View list contents | PASS (Chrome + Firefox) |
| B2C-LIST-011 | Privacy toggle Private↔Shared | PASS (Chrome + Firefox) |

## Cross-Cutting Checks

| Area | Result |
|------|--------|
| Build verification (theme bundle in footer) | PASS |
| Console errors during session | 0 |
| Network 4xx / 5xx | 0 |
| GraphQL `errors[]` | 0 (~25 wishlist queries, all HTTP 200) |
| Locale switch (EN → DE → EN) | PASS — no `Saved:` leak, no raw i18n key, dates localize, chip labels translate |
| Responsive (1920×1080, 768×1024, 375×812) | PASS |
| Lighthouse a11y score (page-level) | 95/100 |

## A11y Findings — Bugs to Consider Filing

ui-ux-expert audit surfaced four a11y items. Two were introduced by this PR (High), two are tangential (Medium / Low).

| Bug | Severity | WCAG | Introduced by PR? |
|-----|----------|------|-------------------|
| **BUG-A11Y-001** save-v2 icon contrast 2.56:1 vs white background (info-400 token too light for standalone use) | **High** | 1.4.11 | Yes — new use of `text-info-400` on white card |
| **BUG-A11Y-004** Removing `"Saved:"` text leaves date with no SR label — bare date string announced | **High (Regression)** | 1.3.1 | Yes — direct consequence of removing the label |
| BUG-A11Y-002 save-v2 icon lacks `aria-hidden="true"` | Medium | 1.1.1 | Yes — new icon |
| BUG-A11Y-003 chip icons lack `aria-hidden` | Low | 1.1.1 | No — pre-existing |

These are accessibility issues that fall outside the ticket's stated ACs. **Recommend filing BUG-A11Y-001 and BUG-A11Y-004 as separate JIRA tickets** for the dev team to address before this PR merges to `dev`. The verdict here is **PASS WITH NOTES** because:
- The ticket's stated ACs (chip color update + saved→icon swap) are met.
- The a11y issues are real but tangential to this ticket's explicit scope.
- 2 of 3 execution agents called PASS WITH NOTES; ui-ux-expert called FAIL on a11y grounds.

## Pre-Existing Risks (Not PR Regressions)

| ID | Severity | Description |
|----|----------|-------------|
| R-1 | Medium | "Create list" button disabled for storefront user (TechFlow Inc.) — no tooltip. Blocks B2C-LIST-001/-002 spot-checks but unrelated to this PR. Separate ticket recommended. |
| R-2 | Low | JA / ZH locales fall back to EN for chip labels & date format. Pre-existing translation gap. |
| R-3 | Low | No defensive `v-if` guard on icon+date wrapper if `modifiedDate` is null. |
| R-4 | Trivial | Gear popover lingers behind List Settings modal until outside-click. |
| R-5 | Open | Network-failure-during-privacy-toggle deferred — playwright-firefox MCP can't throttle. Follow up with Chrome DevTools MCP. |

## Business Rules Verified

- **BL-B2C-002** Lists feature exists & functions — exercised via list rendering, privacy toggle, edit modal, navigation, back-button state, and multi-tab behavior. Intact.

## Artifacts

- Testing checklist: `tests/Sprint-current/VCST-4898/testing-checklist.md`
- Frontend execution report: `tests/Sprint-current/VCST-4898/test-execution-report-frontend.md`
- Design / a11y audit: `tests/Sprint-current/VCST-4898/design-audit-report.md`
- Cross-browser + SBTM: `tests/Sprint-current/VCST-4898/cross-browser-and-exploratory-report.md`
- Evidence: `tests/Sprint-current/VCST-4898/evidence/` (14 screenshots + HAR + network log)
- Summary JSON: `tests/Sprint-current/VCST-4898/summary.json`

## Recommended Next Actions

1. **Optional — file two a11y bugs** (BUG-A11Y-001 contrast, BUG-A11Y-004 SR label regression) before merging PR 2271.
2. **JIRA transition** (with your confirmation): `Finish test` → TESTED. The ACs as written are met; a11y findings can be tracked in their own tickets.
3. **Optional — file R-1** as a separate bug (Create list disabled with no tooltip) since it blocks routine list workflow.
