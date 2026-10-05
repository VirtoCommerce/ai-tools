# VCST-6011: Verification (edge lane, Chromium engine)

**Env:** vcptcore-qa · Platform 3.1072.0 · PageBuilderModule 3.1030.0-pr-165-1ab4 (taken from the brief)
**Lane:** playwright-edge, default context with no clipboard grant · 2026-10-01 · login admin / `ADMIN_PASSWORD_VCPTCORE`
**Verdict: core bug FIXED. Menus were populated 3/3, with no readText call. One deviation from the PR claim: Paste is never disabled (see Finding A).**

## Setup
- Created a page in the UI: `AGENT-TEST-VCST-6011-edge-k7q2` (group id `d964e62b-2f71-43d6-8c49-cfd24b0714bc`, en-US) with 3 sections: Image, Call to Action, Features.
- Each run was a full document reload (about:blank → Designer URL, confirmed by `performance.now()` ≈ 1–4 s). F5 and a hash-only goto do NOT reload the Angular app.
- Probe: `navigator.permissions.query({name:'clipboard-read'})` returned **`prompt`** before every run. `navigator.clipboard.readText` was wrapped with a counter (`window.__rt`).
- The read-only probes ran as `browser_evaluate` with an `@allow-eval` DEBUG tag. Every UI action was a real click, hover or keypress.

## Checklist
| # | Item | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Section tune populated 3/3, no permission | **PASS** | Run 1 CtA · run 2 Features · run 3 Image. Each showed Hide/Copy/Paste before/Paste after/Duplicate/Delete. `edge-section-menu.png` |
| 2 | Page tune populated 3/3; Save selected as Shared Component present & enabled | **PASS** | All 3 runs: Paste section / Delete selected / Save selected as SC / Reset template / Refresh preview. Delete selected and Save-as-SC are `disabled` with nothing selected, and enabled once 2 sections were ticked. `edge-page-menu.png` |
| 3 | Root cause: readText counter == 0 while opening menus | **PASS** | `__rt=0` after every menu open in all 3 runs, in the denied run, and in the granted run with an invalid payload. The counter goes to 1 only on a Paste **click** |
| 4 | Paste entries disabled without permission | **FAIL vs PR claim** | Paste before/after/section are enabled (`aria-disabled="false"`, opacity 1) in both `prompt` and `denied` states. See Finding A |
| 5 | Native right-click opens section actions | **PASS** | Right-click on the Image, Call to Action and Features rows opened "Actions for …", fully populated. `edge-rightclick.png` |
| 6 | Escape restores row focus | **PASS** | After the tune menu, `activeElement` is the row's own "Actions for <section>" button. After the right-click menu, it is the row's name button. Menu count 0 |
| 7 | Shared Component via UI end-to-end, persists, usage 1 | **PASS** | Ticked Image + CtA → Save selected as SC → name → Save. `POST /api/page-builder-shared-components` 201 (id `b1c33a19b039414a9dd71d4932c0cb8c`). The 2 sections were replaced by the placement ("Used on 0" before the page save). Page save `POST …/content` 204. After a full reload: "Shared · Used on 1 page(s)". `edge-sc-created.png`, `edge-sc-persisted.png` |
| 8 | Granted: Copy → Paste works | **PASS** | Copied Image (toast "Copied to clipboard") → Features tune → Paste after enabled → toast "Section pasted", and a 2nd Image row appeared. `edge-granted-paste-enabled.png`, `edge-granted-paste-done.png` |
| 9 | Granted: invalid payload → Paste disabled | **PARTIAL** | Clipboard = `not a section`. Paste is still **enabled** when the menu opens (no read on open). On click: alert **"Incorrect data in clipboard"** plus a manual-paste dialog, and nothing is inserted. Validation is preserved, but at click time rather than by disabling. `edge-granted-invalid-payload.png` |
| 10 | No new console errors / no empty overlay | **PASS** | Empty overlay panes: 0 in every probe. Designer console: 0 errors, only known noise warnings (preload credentials mismatch, storefront postMessage origin). The shell login screen's `/connect/token` 401 is a pre-login silent-impersonate attempt and is expected |

Run tally: **3/3**. Nested block (step 6): N/A, because the seeded sections have no child blocks. The Shared Component placement's own menu (Edit original / Detach / Copy / Paste before / Paste after / Delete) was also populated.

## Denied case (real user, no init-script fake)
Clicking an enabled Paste in `prompt` state raised Edge's own dialog "vcptcore-qa.govirto.com wants to See text and images copied to the clipboard" (`edge-paste-click-prompt.png`). The first time I dismissed it. The second time I clicked **Block**, and the state became `denied`. After a full reload, the section and page menus were fully populated, `__rt=0`, and Paste was still enabled (`edge-denied-section-menu-paste-enabled.png`). Clicking Paste section was a silent no-op: the console logged `NotAllowedError … Read permission denied`, there was no toast, and the page was unchanged.

## Findings
- **A (Low/Medium, deviation from PR #165 description).** Paste items are never disabled, whatever the permission state. Clipboard availability and payload validity are checked only on click. In `denied` state the click gives the user **no feedback**: no toast and no dialog, only a `console.log`. A recommendation for the dev: disable Paste when `permissions.query` returns `denied`, or show the existing "Incorrect data in clipboard" style toast. This does not block the VCST-6011 fix, because the menus render and Save-as-SC is reachable.
- **B (needs triage, low confidence).** Copying the **Features** section and choosing Paste after (on the SC placement row) was refused with the alert "Template Pages cannot contain section features" and the manual-paste dialog (`edge-granted-paste-features-refused.png`). The same Features type was accepted through "Add block" on this page. There is an Add-vs-Paste allowance inconsistency. Not filed; it needs a repeat on another lane before it becomes a bug.
- The F5 key and same-URL hash navigation do not reload the Designer SPA. A tester who "F5s" via the MCP key press is not testing a fresh load.

## Cleanup
- SC placement deleted from the page, page saved (`POST …/content` 204).
- Shared Component `b1c33a19b039414a9dd71d4932c0cb8c` deleted (`DELETE` 204, gone from the list).
- Page `d964e62b-2f71-43d6-8c49-cfd24b0714bc` archived (`POST …/grouped/archive` 204).
- `clearPermissions()` ran. The origin's clipboard-read still reads `denied`, because of the real **Block** click, which is a browser content setting and not a Playwright override. It lives in the edge lane's isolated context and is discarded with it.
- **Leftovers: none on the server.**

## KB
`KB-E423C32F` was captured (queued, not yet pushed). It records: the Designer menus do not read the clipboard on open; Paste is validated on click.
