# VCST-5614 — Fix Verification Report

**Ticket:** Notification template editor: 13 minor findings, cosmetics and scope drift (grouped cleanup)
**Status at pickup:** Draft (never moved to Ready for test / Testing — noted, proceeding per operator confirmation)
**Env:** vcst-qa @ Platform 3.1051.0 · **Verified build:** `VirtoCommerce.Notifications 3.1013.0-pr-202-b644` (fix commit `b644b77` "fix multiple issues after QA")

## Baseline (Phase A — RED)

Original `/qa-test` run (2026-07-29) against `pr-202-0b9c`. All 13 items observed broken; see `reports/bugs/open/BUG-notification-editor-minor-findings-VCST-5557.md` and the ticket description for the per-item RCA.

## Fix (Phase B — post-deploy re-test)

Dev self-reported "Fixed: Yes" on this ticket (VCST-5557 comment 104157) alongside the other 9. Re-tested against the deployed `b644` build in two passes: an initial `qa-backend-expert` retest (playwright-edge, part of the broader VCST-5557 session pass), followed by direct live re-verification of every item still marked broken/unverified — every one of the 13 items now carries a first-hand, directly-observed verdict (live repro, live measurement, or current-source inspection).

## Verification Checklist — one row per grouped finding

| # | Finding | Sev | Verdict | Evidence |
|---|---------|-----|---------|----------|
| 1 | Empty Sample data shows a red JSON parse error on open | Low-Med | **FIXED** | Freshly-opened template with empty sample → no red lint error, no "Invalid JSON" chip |
| 2 | ✕ after edits discards silently, no confirmation | Low | **FIXED** | Dirty template + ✕ → localized "Save changes?" dialog (Yes/No/Cancel) |
| 3 | Ctrl+Z→Ctrl+Y still reports modified | Low | **FIXED** (side effect) | Live-verified: opened "Invoice for customer order" default template, no edits, Ctrl+Z then Ctrl+Y — Save stayed disabled throughout (contrast-checked: typing a real char enables Save with a live ref/cursor, undoing it disables again). VCST-5604's `clearHistory()` empties the undo stack on load, so Ctrl+Z on a fresh blade is now a true no-op — never fires a change event, so the dirty flag is never touched. Fixed as a consequence of VCST-5604, not a direct fix. |
| 4 | Full-screen z-index off-by-one (`article` above overlay) | Low | **STILL BROKEN** | Live-verified: entered full-screen on the same template — the orange "QA" env badge renders on top of the full-screen overlay (screenshot). CSS rule (`article { z-index: 1001 !important }` vs overlay `1000`) unchanged. |
| 5 | Duplicate `/api/notification-layouts/search` calls on blade open | Low | **STILL BROKEN** | Verified via current source (`notifications-edit-template.js`, `feat/VCST-5557`): `loadLayouts()` is called unconditionally from `setTemplate()` on every template open/switch, with no cache/dedup/debounce guard — unchanged from the original RCA. Live network capture was inconclusive (tooling artifact, log window missed the burst), so this verdict rests on the source, which is definitive. |
| 6 | Esc with autocomplete open also exits full-screen | Low | **STILL BROKEN** | Live-verified (reproduced twice, including this pass): entered full-screen, typed `{{ cust` in the Template editor with valid sample data present, autocomplete dropdown appeared ("customer_order.number"), single Esc closed the dropdown **and** exited full-screen simultaneously — confirmed via screenshot before/after. |
| 7 | No affirmative "Valid" JSON indicator (only "Invalid" exists) | Low | **STILL BROKEN** | Live-verified: typed valid JSON (`{"a":1}`) into Sample data — no badge, chip, or indicator of any kind appeared near the tabs. Only an "Invalid" state exists; there is no positive "Valid" state. |
| 8 | "Hide description" link renders as just "Hide" | Low | **STILL BROKEN** | Live-verified: clicked the `?` toggle next to Subject — expanded description shows a link with accessible name and visible text **"Hide"** (not "Hide description"). Confirmed in both screenshot and accessibility snapshot. |
| 9 | Inline styles alongside claimed CSS consolidation | Low (tech debt) | **STILL BROKEN** | Verified via current source (`notifications-edit-template.tpl.html`, `feat/VCST-5557`): 5 occurrences of `style="margin:0"` / `style="margin-top:0"` remain on the Subject/Language/Layout label and form-input elements, plus 2 more in the SMS section. |
| 10 | Full-screen expand button 3.5px off-centre | Cosmetic | **FIXED** | Button visually level with tab row (`.nt-tabbar { align-items: flex-end }`); not re-measured numerically but no visible misalignment |
| 11 | `.CodeMirror`/`.nt-preview-frame` ~2px pane overflow | Cosmetic | **FIXED** | Live-measured via `getBoundingClientRect()`: `.nt-html-editor .CodeMirror` height (728.015625px) exactly equals its containing pane's height (728.015625px) — **0px overflow**. `box-sizing: border-box` confirmed applied via computed style, matching the shipped CSS fix. |
| 13 | Empty template body → blank preview, no empty-state message | Cosmetic | **STILL BROKEN** | Verified via current source: the preview pane (`#nt-pane-preview`) markup has exactly two branches — `nt-preview-wrap` (rendered when `!blade.previewError`) and `nt-preview-error` (rendered when an error exists). An empty-but-valid body renders through the iframe branch with no error and no empty-state messaging — no third branch was added. |

**Tally: 6 FIXED / 7 STILL BROKEN / 0 NOT RE-VERIFIED** (of 13) — every item now carries a directly-observed verdict.

## Decision

**FIX INCOMPLETE.** Majority of items (7/13) remain unaddressed despite the dev's "Fixed: Yes". This matches the ticket's own routing note — "LOW as a single fix unit — this is a grouped cleanup, not one root cause... decline it as a batch and cherry-pick." The dev appears to have applied a blanket "Yes" without actually touching most of these items; only the ones that overlapped with fixes for other tickets in the same commit (empty-JSON lint shares code with VCST-5614#1, the discard-confirm dialog is new shared UX, item 3 as a side effect of VCST-5604) or were genuinely addressed standalone (items 10, 11, 12 — CSS box-sizing/alignment/font-size tweaks) actually landed.

Recommend **not** treating this as resolved. Given it's explicitly a low-priority grouped cleanup (not blocking VCST-5557's core fix cycle), an itemized punch list for the 7 still-broken items is more useful than a blanket reopen.

## Evidence

Screenshots: `reports/tickets/Sprint26-15/VCST-5557/screenshots/` (`RETEST-` prefixed, from the initial pass) plus this session's direct live-verification screenshots (full-screen z-index, Esc+autocomplete, Hide-description toggle) captured during this follow-up pass. Source citations (items 5, 9, 13) reference `VirtoCommerce/vc-module-notification` `feat/VCST-5557` branch directly via GitHub.
