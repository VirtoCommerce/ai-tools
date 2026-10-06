# VCST-5670 — Testing Checklist (round 4)

**Path:** fast · **Flow:** feature-test · **Type:** Task (P2/Medium) · **Shape class:** none · **Layer:** `null` (`UNRESOLVED`, the same tooling gap as before: vc-shell has no layer token)
**Env:** vcmp-dev Vendor Portal (`https://vcmp-dev.govirto.com/apps/vendor-portal/`; no env var carries this URL). `@vc-shell/framework` **2.6.1**, build `58488`, last-modified 2026-09-30 14:44:30 GMT · Chrome (`playwright-chrome`) · Light theme
**Verdict: PASS WITH NOTES → TESTED (pending operator confirmation)**. All 15 conditions pass, both sub-tasks pass, and `<body>` never appeared in a settled state. The notes concern condition 7a and an out-of-scope 500.

## Deploy gate: PASSED

| Check | Result |
|---|---|
| Served framework | **2.6.1**: the version string appears in both `vc-shell-framework58488.js` and `vc-shell-vendors58488.js`; console banner `v2.6.1 · 2026-09-29T10:58:05Z · ce2647528` |
| npm | `2.6.1`, `gitHead` `71368702d` (`latest` is now `2.6.2`, not yet deployed) |
| #370 (Save target, `9977ed633`) | ancestor of the 2.6.1 gitHead. It is **not** in v2.6.0, which was released one commit before the merge |
| #344 · #353 | ancestors of the 2.6.1 gitHead (checked directly) |
| #355 · #343 · #347 | ancestors of v2.6.2 ⊇ 2.6.1 |
| Condition 12 doc | `framework/core/utilities/focus.docs.md` is present at v2.6.1 |

## Oracle

The expected target for each transition comes from `focus.docs.md` at v2.6.1 `{SPEC}` (this ticket's AC-2 deliverable) and the ticket ACs `{SPEC}`.
- A **repair** may decline when something live already holds focus, and that counts as a pass.
- A **handoff** must move focus to the replacement control.
- Every row also checks the unconditional AC: never `BODY`.
- Rules in force: BL-A11Y-001 (WCAG 2.4.3, the keyboard part). ECL: no focus or keyboard entry applies.
- **Measurement:** a hook blocked the planned `document.activeElement` probe (`browser_evaluate`), and the agent did not bypass it.
  - Readings are the Playwright snapshot `[active]` node (tag/role/name), taken after a ~1 s settle. That is the evidence `focus.docs.md` itself names.
  - Readings taken mid-transition were discarded.
  - A Tab-once check is **not** discriminating on sidebar paths.

## Conditions

| # | Condition | Expected target (focus.docs.md) | Kind | Source | Verdict |
|---|---|---|---|---|---|
| 1 | Sign-in redirect to dashboard | shell workspace `.vc-app__workspace` | repair | AC-1 | **PASS** 3/3: `main [active]` (workspace) |
| 2 | Blade open, row click | blade root, or the clicked row if it still holds focus | repair | AC-1 | **PASS** 2/2: the clicked row keeps `[active]` (repair declined) |
| 2b | Blade open, keyboard (Enter on a row) | blade root or the row, never BODY | repair | AC-1 | **PASS** 2/2: Enter opened the blade, and the opening row keeps `[active]`. Rows are reached by Tab (row → its checkbox → next row); arrow keys do not move between rows |
| 3 | Maximize, header button | `button "Restore"` | handoff | AC-1 | **PASS** 3/3: `button "Restore"` |
| 4 | Restore, header button | `button "Maximize"` | handoff | AC-1 | **PASS** 2/2: `button "Maximize"` |
| 5 | `Ctrl+\` with focus on the expand control, both directions | the replacement control | handoff | AC-1 · VCST-5812 | **PASS**: Product 4+4, Offers 2+2 reps. Replacement control every time |
| 6 | `Ctrl+\` with focus in the sidebar, then restore | blade root; restore never BODY | repair | AC-1 · VCST-5859 | **PASS**: blade root on maximize and on restore, from all 3 origins |
| 7 | **Save as draft on an already-loaded blade (#370)** | blade root via `watch(loading)`, or Save itself if it stays live | repair | AC-1 | **PASS** 2/2: `region "Product Level 4 x y z q" [active]` (blade root) |
| 7a | Is condition 7 discriminating? | records whether the PASS is attributable to #370 or to the old remount path | — | 2026-09-02 note | **Not discriminating**: the blade REMOUNTED on every save (region ref e6745→e7269→e7722). The PASS cannot be credited to #370's `watch(loading)` rather than the old mount repair |
| 8 | Popup close (delete dialog → Cancel / Escape) | the opener, or the workspace if the opener is gone | repair | focus.docs.md | **PASS** 2/2: the opener `button "Delete"` is `[active]`. Confirm was never pressed |
| 9 | Sign-out | unauthenticated layout root | repair | VCST-5813 (regression) | **PASS** 3/3: `main [active]` on the login layout |
| 10 | Self-disabling button (pagination First/Last) | a defined element, never BODY | — | VCST-5806 · VCST-5861 (regression) | **PASS** 3/3: `main [active]` after the clicked button self-disabled |
| 11 | Maximize control is Tab-reachable; Enter **and** Space work | Enter → Restore, Space → Maximize | — | AC-1 | **PASS** 3+3 |
| 12 | Target documented for every transition | `focus.docs.md` lists all 9 transitions with target and kind | — | AC-2 | **PASS** (static): includes both `mod+\` paths and Save |
| 13 | Live targets match the documented ones | each of #1–#10 agrees with the table | — | AC-2 | **PASS**. The *first-load park* row was not live-measured (outside the ticket's four transitions) |
| 14 | Verified by live measurement, not only unit tests | this run | — | AC-3 | **PASS** |

## Sub-tasks verified in this run (added at the operator's request)

| Key | Sev | STR summary | Expected (fix) | RED baseline | Verdict |
|---|---|---|---|---|---|
| **VCST-5812** | Low | Tab to the blade header Maximize control, then `Ctrl+\` (not Enter/Space), both directions, on two blade types. Control case: chord with focus on the blade region | `Restore` / `Maximize` handoff (#344) | 2.5.0: `BODY`, no `[active]`, 3/3 both directions | **PASS** — see notes below |
| **VCST-5859** | Medium | Focus on sidebar Notifications / nav Search / Home, then `Ctrl+\`, then `Ctrl+\` again | blade root on maximize and restore (#353) | 2.6.0-rc.0: `BODY` 3/3 from all origins; restore did not recover | **PASS** — see notes below |

**VCST-5812 notes:**
- Product blade 4+4 reps, Offers blade 2+2.
- Tooltip `Maximize Ctrl + \` confirmed.
- Control case (focus on the blade region) stays on the blade root.
- The Orders item blade from the STR is not testable: Orders is a storefront iframe, not a vc-shell blade.

**VCST-5859 notes:**
- Reps: Notifications 2, nav Search 3 (one rep re-run by the orchestrator for evidence), Home 1.
- No `[active]` node is left in the sidebar after either chord.

## Findings

- **Filed:** none.
- **Not filed (below severity floor):** none newly drafted. The known Low `reports/bugs/open/low/BUG-vc-shell-app-switcher-icon-404s.md` was not re-checked; the app-hub popover was not opened.
- **Needs review, out of scope, not filed:** `GET /api/vcmp/message/unreadcount` returned **500** twice when an offer was opened (MarketplaceCommunication module). The agent saw this in the console only; nobody reproduced or investigated it.
- **Dismissed as env/data:** product and offer thumbnails return 404 or `ERR_NAME_NOT_RESOLVED` (`vcmarketplace-platform.dev.govirto.com`, `cms-content/assets/catalog/…`, `i.etsystatic.com`).
- **Noise:** `[VcDataTable] Column width crisis`, tiptap duplicate `link`/`underline` extensions, `[ai-agent-context] no blade id available`.

## Uncovered by design

- **No screen-reader pass**: a missing `[active]` node is a structural measurement, not a listening test.
- **No change-scoped regression (C1 skipped):** the exact set is empty, and no regression suite covers vc-shell or the Vendor Portal. Feature Release Gate: `not-assessed`.
- **No App Insights correlation**: no component is configured for vcmp-dev.
- **No authored cases**: this is a FAST run. `/qa-test-lifecycle` is the way back in.

## Data

`data_surface: false`. The run uses existing entities only.
- Product count: **463 before, 463 after**. PLV4 is still Draft/Inactive.
- Edit made: `Localized name en-US` set to `AGENT-TEST-5670`, then cleared, both via *Save as draft*.
- Delete dialog dismissed, never confirmed.
- Final state: signed out.

**Evidence:** `reports/tickets/Sprint26-20/VCST-5670/screenshots/`, which contains:
- `cond1-signin-dashboard-final.png`
- `5812-product-maximize-tooltip.png`
- `cond2b-enter-open-row-keeps-focus.png`
- `5859-navsearch-maximize-focus-blade-root.png`
