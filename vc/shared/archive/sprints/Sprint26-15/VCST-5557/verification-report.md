# VCST-5557 — Fix Verification Report

**Env:** vcst-qa @ Platform 3.1051.0 · **Verified build:** `VirtoCommerce.Notifications 3.1013.0-pr-202-b644` (fix commit `b644b77` "fix multiple issues after QA", live on `vcst-qa` — confirmed via deploy-branch `packages.json` + agent-observed module version).

## Baseline (Phase A — RED)

The pre-fix baseline is the original `/qa-test` run (2026-07-29) against `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`: 84 conditions, 19 failed, 11 bugs filed (VCST-5604–5614, minus cancelled VCST-5609). See `reports/tickets/Sprint26-15/VCST-5557/summary.json` (prior artifact) and the 10 linked bug tickets for the full RED evidence.

## Fix (Phase B — post-deploy re-test)

Dev (Oleg Zhuk) pushed one squashed commit addressing all 10 open findings and self-reported "Fixed: Yes" on every ticket (VCST-5557 comment 104157). Re-tested live via `qa-backend-expert` (functional, playwright-edge) + `ui-ux-expert` (accessibility, playwright-chrome) against the deployed `b644` build.

## Verification Checklist — one row per filed bug

| # | Ticket | Finding | Verdict | Evidence |
|---|--------|---------|---------|----------|
| 1 | VCST-5604 | Ctrl+Z on fresh template wipes body | **FIXED** | `clearEditorHistory()` present; 3× Ctrl+Z, body intact |
| 2 | VCST-5605 | Tab switcher keyboard-inaccessible, no focus indicator, contrast failures | **PARTIALLY FIXED** | Keyboard nav/focus-ring/iframe-title/3 of 3 contrast items fixed; `?` help icon still unfocusable + still 1.60:1 contrast (unchanged); **new**: rejected `#43b0e6` reappeared on Format buttons (2.44:1), **new critical**: dangling `aria-labelledby` on full-screen preview tabpanel |
| 3 | VCST-5606 | Predefined-source overwrite warning missing (note commented out by PR #202) | **STILL BROKEN** | Dev added `nt-note` class/CSS/`role="alert"`/i18n scaffolding but never removed the `<!-- -->` HTML comment wrapper — `0` occurrences of `nt-note`/`role="alert"` in deployed `dist/app.js`; note never renders |
| 4 | VCST-5607 | Drill-down Save doesn't persist; false "Modified: today" | **FIXED** | `PUT /api/notifications/{type}` → 204; API re-read confirms new subject persisted |
| 5 | VCST-5608 | Ctrl+Q fold TypeError; dead fold gutter | **FIXED** | Fold addons bundled; gutter shows arrows; Ctrl+Q folds/unfolds, no console error |
| 6 | VCST-5610 | Preview 500 on mid-edit Liquid; toast blocks blade ✕ | **FIXED** | Now 400 not 500; no blocking toast; inline "cannot be rendered yet" message (label itself is hidden in full-screen by the same rule as #8, noted not double-counted) |
| 7 | VCST-5611 | Format JSON/HTML error dialogs hardcoded English | **FIXED** | RU dialog fully localized ("Ошибка JSON" / "Не удалось отформатировать..." / "ОК") |
| 8 | VCST-5612 | Full-screen hides "Invalid JSON" preview message | **STILL BROKEN** | `.notification-edit-template .nt-editor.__fullscreen .table-descr { display:none }` byte-for-byte unchanged; full-screen preview pane still blank on invalid JSON |
| 9 | VCST-5613 | Deep-link URL params linger ~30s after close | **FIXED** | Params cleared immediately on ✕ (checked with no intervening click); F5 does not reopen closed blade |
| 10 | VCST-5614 | 13 grouped minor findings | **PARTIALLY FIXED** | 4/13 fixed (empty-JSON lint, discard-confirm dialog, Esc-consumes-autocomplete... wait, Esc item reproduces — see below; fs-button alignment, help-text size); item 6 (Esc closes autocomplete AND fullscreen) reproduces despite dev's "Yes"; items 4/5/7/8/9/13 untouched |

## Regression spot-check

| Check | Result |
|---|---|
| Save persists on deep-link entry | PASS — 204, API re-read confirms |
| Save persists on drill-down entry (VCST-5607) | PASS |
| Tab switching / live preview / Save-Cancel round-trip | PASS — no new console errors beyond pre-existing env noise |
| Predefined template Preview + Send test email stay enabled | PASS |
| Save blocked while Sample JSON invalid | PASS (bonus) |

## Decision

**FIX INCOMPLETE.** 6 of 10 findings are genuinely and cleanly fixed. 4 are not:
- **VCST-5606** (Medium) — the compliance-relevant "this will overwrite the predefined default" warning still never renders; the fix was prepared (CSS, ARIA role, i18n keys all shipped) but the HTML comment wrapping the note was never removed. This is the most consequential outstanding item — a silent-overwrite risk the story's own AC set out to prevent.
- **VCST-5612** (Low) — untouched.
- **VCST-5605** (High, partial) — 3/5 sub-items fixed, but the fix introduced a **new critical** accessibility regression (dangling ARIA reference in full-screen) and **reintroduced** a previously-fixed-elsewhere contrast failure on new markup.
- **VCST-5614** (Low, grouped) — 4/13, as expected for a "decline as a batch, cherry-pick" grouped ticket; not blocking on its own.

Per the dev's own tracking comment claiming "Fixed: Yes" across the board, this is a case of overclaiming coverage — two items (5606, 5612) were never actually touched at the point the dev checked "Yes" against them, and the underlying code shows why.

## Evidence

`reports/tickets/Sprint26-15/VCST-5557/screenshots/` (prefixed `RETEST-` and `RETEST-A11Y-`). Per-ticket verification comments posted to VCST-5604/5607/5608/5610/5611/5613 (now Tested). Jira: VCST-5605/5606/5612/5614 remain in Draft — no comment posted with this pass; findings summarized here and in the original bug tickets.
