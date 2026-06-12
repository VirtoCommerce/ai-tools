# VCST-5176 — Fix Verification: Org Switcher Keyboard Navigation

**Verdict: VERIFIED** · A11y bug (WCAG 2.1.1 Keyboard / 2.4.7 Focus Visible)
**Env:** vcst-qa @ Theme `2.51.0-pr-2321-d120-d1207c8d` (PR #2321 confirmed deployed via footer version) · Chromium
**Account:** multi-org user `ricreyacrouyi-3425@yopmail.com` (11 orgs) · component `top-header-organizations.vue`

## Summary
Keyboard navigation of the account-menu Organizations switcher now works end to end. ArrowDown moves a visible roving highlight off the searchbox onto list options (tracked via `aria-activedescendant`), Enter switches the active org, Escape closes the dropdown and returns focus to the account button. Full ARIA combobox/listbox/option wiring is present in the live DOM. No new console errors. Mouse selection and type-to-filter still work.

## STR Result: 3/3 PASS
| Run | Path | Switched to | Result |
|-----|------|-------------|--------|
| 1 | ArrowDown ×2 → Enter | "Müller" % Schmidt GmbH | PASS |
| 2 | ArrowDown ×2 → Enter | "Quoted" Double Quotes | PASS |
| 3 | ArrowDown ×5 → Enter | ACME Store | PASS |

## Checklist: 10/10 PASS
1. Original STR (ArrowDown→Enter) keyboard nav works — **PASS** (3/3).
2. ArrowDown moves visible highlight onto an option; focus leaves searchbox — **PASS** (option gains `[active]` / roving focus; searchbox loses it).
3. Enter on highlighted non-current org switches active org — **PASS** (header + nav menu both reflect new org each run).
4. Mouse-click selection still works — **PASS** (clicked BMW-Group → switched).
5. Type-to-filter (VCST-4815) still filters — **PASS** ("ACME" narrowed 11→subset; clearing restored 11; current org stays pinned first).
6. No new console errors — **PASS** (only benign 404s: favicons, catalog `.webp` images, `electro2.json` preset; no JS exceptions, none tied to switcher).
7. ARIA wiring in live DOM — **PASS** (searchbox `role=combobox` + `aria-expanded`; `aria-activedescendant` updates as arrowing; `listbox` with aria-label; each item `role=option`; current org `aria-selected=true` and is FIRST option). Confirms PR build deployed.
8. Focus indicator visibly rendered on focused option — **PASS** (distinct background band on roving option, see screenshot 04).
9. Escape closes dropdown AND returns focus to account button — **PASS** (button became `[active]`, no longer `[expanded]`).
10. ArrowUp/ArrowDown wrap at boundaries — **PASS** (ArrowUp from first → last "'Single' Single Quotes"; ArrowDown from last → first).

## Evidence
- `screenshots/01-arrowdown-highlight-on-option.png` — ArrowDown roving highlight on an org option (key proof).
- `screenshots/02-post-enter-org-switched.png` — post-Enter switched-org header state.
- `screenshots/03-focus-indicator-on-option.png` — open dropdown with focused option.
- `screenshots/04-listbox-focus-closeup.png` — focus-indicator close-up (WCAG 2.4.7).
- Console: 3 errors, all benign 404 static-asset misses; no fix-related errors.

## Notes
- Current org is dynamically re-pinned as the first list option after each switch, matching the PR description.
- `browser_evaluate` ARIA dump was hook-blocked (correct); roles/states verified via the accessibility snapshot tree and behaviorally via `aria-activedescendant` roving.
