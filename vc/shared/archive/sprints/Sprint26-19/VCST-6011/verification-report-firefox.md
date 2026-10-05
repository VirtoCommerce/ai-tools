# VCST-6011 — Fix verification, Firefox lane

- **Date:** 2026-10-01 · **Env:** vcptcore-qa (Admin `BACK_URL`, store `B2B-store`) · **Lane:** `playwright-firefox` (Firefox 151.0, Windows)
- **Build (per brief):** Platform 3.1072.0 · PageBuilderModule 3.1030.0-pr-165-1ab4 (PR #165 HEAD)
- **Verdict: original bug FIXED on Firefox (menus populated 3/3, zero clipboard reads). One FAIL: native right-click (AC "Right-click opens section actions").**
- Runs: 3 consecutive. Each reload went through `about:blank` because Playwright's `F5` and same-URL navigation did not reload. New element refs confirmed a fresh document each time.

## Clipboard capability (the bug's precondition)
- `typeof navigator.clipboard.readText` = **`function`**. It exists in Firefox 151.
- `navigator.permissions.query({name:'clipboard-read'})` **throws** a `TypeError`: `'clipboard-read'` is not a valid `PermissionName`.
- Root-cause probe: before any menu was opened in each run, `navigator.clipboard.readText` was wrapped with a call counter that still delegates to the original. **Positive control:** clicking Paste after moved the counter 0 to 1, so the wrapper is live.

## Checklist

| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Section tune menu populated | **PASS 3/3** | 6 items each run (Hide, Copy, Paste before, Paste after, Duplicate, Delete), rendered within about 1 s. `ff-section-menu.png` |
| 2 | Page tune menu populated; "Save selected as Shared Component" present | **PASS 3/3** | 5 items: Paste section, Delete selected, Save selected as Shared Component, Reset template, Refresh preview. Save-selected is `aria-disabled` with no selection and enabled with 2 sections selected. `ff-page-menu.png` |
| 3 | No clipboard-read gating | **PASS** | `readText` calls while opening menus = **0** across 3 runs × (section + page + right-click) and on the shared-placement menu. It was called only when Paste was clicked. Matches the PR diff: `hasClipboardData()` was removed from `getSectionsActions`/`getPageActions` |
| 4 | Paste before/after/Paste section DISABLED | **NOT MET as briefed, but intended (see S2)** | All Paste items are enabled (`disabled=false`, `aria-disabled=false`). PR #165 states: *"Paste remains available before clipboard permission is granted; clicking it reads the clipboard or opens the manual paste dialog."* The brief's expectation contradicts the shipped design |
| 5 | Native right-click opens section actions | **FAIL 0/3** | The menu opens populated (6 items), then closes after 8–13 ms. Event trace below. `ff-rightclick-menu.png` |
| 6 | Escape closes menu and restores row focus | **PASS 3/3** | Overlay removed. `activeElement` = that row's "Actions for Call to Action" trigger, with the matching row index (0/2/1) |
| 7 | Shared Component end-to-end, persists, usage 1 | **PASS** | Selected 2 adjacent CTA sections, then page tune, then Save selected, named `AGENT-TEST-VCST-6011-ff-SC-k7q2`. `POST /api/page-builder-shared-components` returned 201 (id `c84970e82c3d4c2aafb3d39d77e50ad3`); the 2 sections collapsed into 1 placement ("Shared · 0" before save). Page save returned `POST …/content` 204. After a real reload the placement persisted with **"Used on 1 page(s)"**. Its menu showed Edit original, Detach, Copy, Paste before/after, Delete, with `readText` = 0. `ff-sc-created.png` |
| 8 | Other actions: Duplicate, Hide | **PASS** | Duplicate added `calltoactionAND`; Hide set `.hidden` and the menu then offered "Show"; Delete with OK confirm removed it |
| 9 | No new console errors | **PASS (noise only)** | Only `postMessage` target-origin mismatch (`vcptcore-qa-storefront` vs admin origin) from the preview iframe handshake, 2 per Designer load, unrelated to menus. Two other errors came from my own invalid probe selector and are excluded. No 4xx/5xx on PageBuilder APIs |
| 10 | Empty CDK overlay occurrences | **PASS = 0** | A MutationObserver logged every `cdk-overlay-popover` attach: every open carried 5 or 6 `menuitem`s, and none was empty |

## S1 — FAIL: native right-click menu closes immediately (item 5)

Instrumented event log (document capture listeners plus an overlay MutationObserver), right-click on a section row:
```
774ms mousedown(btn2) -> 774 contextmenu -> 780 overlay ATTACHED (6 items)
790ms mouseup(btn2)   -> 791 auxclick(btn2) -> 793 overlay REMOVED
```
- `onContextMenu` runs: focus moves to the row's `.section-edit-button`, and `gearClick` opens the menu.
- In Firefox (via Playwright), `contextmenu` fires on **mousedown**. The same right press's **mouseup/auxclick** then lands outside the just-attached overlay, and the CDK outside-click dismissal closes it. The user sees at most a flash.
- Reproduced on the name button, the leading icon, and the row container, with and without a prior hover.
- Caveat: real Firefox on Windows may fire `contextmenu` after mouseup, which could avoid this. The mousedown order is the default on macOS/Linux in every browser. Suggested fix direction: ignore the `auxclick`/`click` that belongs to the opening right press, or open on the next tick after mouseup.
- Severity suggestion: **Medium**. The tune button is a working path and nothing is blocked.
- The keyboard path (Shift+F10) could not be exercised: Playwright's synthetic key does not raise `contextmenu`.

## S2 — Brief vs PR mismatch on Paste (item 4) — AMBIGUOUS, needs owner decision
- The brief expected Paste to be **disabled**. PR #165 deliberately keeps it **enabled** and reads the clipboard on click.
- Observed on Firefox: clicking **Paste after** called `readText` (1). Then **nothing happened for more than 10 s**: no section added, no manual-paste dialog, and Escape changed nothing.
- The `readText` promise is apparently still pending, likely waiting for Firefox's native "Paste" prompt. That prompt is browser chrome and is invisible to page screenshots (`ff-paste-after-click.png` shows nothing).
- The PR text promises the manual dialog only when the read is *empty or unavailable*; a read that never resolves gets neither.
- Recommend a 1-minute **manual check in real desktop Firefox**: does a native Paste prompt appear, and does dismissing it open the manual paste dialog? If not, the "never settles" class from VCST-6011 has moved from menu-open to Paste-click.

## Test data / cleanup — COMPLETE
| Entity | Id | Final state |
|---|---|---|
| Page `AGENT-TEST-VCST-6011-ff-k7q2` | `463e0f0d-3c5d-42a2-ad35-811517278bd8` | Placement and extra sections removed and saved (204), then **Archived** (`POST …/grouped/archive` 204) |
| Shared Component `AGENT-TEST-VCST-6011-ff-SC-k7q2` | `c84970e82c3d4c2aafb3d39d77e50ad3` | Usage back to 0, then **Deleted** (`DELETE` 204, gone from the list) |

Nothing is left to clean. The page remains in Archived; delete it if hard removal is wanted. Logged out of the shell.

## Evidence
`screenshots/ff-section-menu.png` · `ff-page-menu.png` · `ff-rightclick-menu.png` · `ff-sc-created.png` · `ff-paste-after-click.png`. Console/snapshots: `test-results/firefox/` (lane artifacts). No HAR is recorded by this lane.
