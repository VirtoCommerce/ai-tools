# VCST-6626 — Visual lane (Step 4v)

qa-design skill: loaded · executor: qa-testing-expert standing in for `vc-test:ui-ux-expert` · lane `playwright-chrome` · 2026-11-02
Build: storefront footer `3.2.0-pr-19-4507-4507f3ae` (vc-frontend-next PR #19, upstream vc-frontend 2.61.0 merge) · Storybook = Next build (index lists VcTabSwitchGroup, VcTileButton, VcStatWidget)
Theme: Coffee (storefront), Storybook default preset · dark via the Storybook `darkMode` global and, on the storefront, `prefers-color-scheme: dark` emulation. No user setting was changed.

## Verdict per target × axis

| Target | BL-UI (layout) | a11y (BL-A11Y-001..004, WCAG 2.2 AA) | vs. DESIGN |
|---|---|---|---|
| B49 VcTileButton (9 stories) | PASS: 0 overflow, rows equal height (96/96), no doc scroll at 375/768/1920 | FAIL (inherited): solid primary 2.11:1, solid secondary 4.05:1 | SKIPPED |
| B49 VcStatWidget (9 stories) | PASS: no clipping at 375; delta uses sign + chevron, not colour alone | PASS: axe clean in light and dark; loading and error announced through `<output>` | SKIPPED |
| B50 VcQuantityStepper (10 stories) | PASS: buttons 28×28 (AA met, below AAA 44 = WARN) | PASS in light. Dark `Errored`: 4.34:1 (inherited from VcInput) | SKIPPED |
| B50 kit locales (13 files) | n/a | CONTENT PASS: every locale has `stat_widget.loading/error` with `{label}` and `{error}` | n/a |
| Sign-in code step | PASS: CLS 0.016, no overflow at 375 | PASS: one `Code` textbox, `one-time-code`/`numeric`, hint linked, visible focus | SKIPPED |
| /account/security | FAIL at 375: CLS 0.183, global footer (F2). 1920: 0.010 | PASS: axe clean in dark; `aria-current=page` in the account nav | SKIPPED |
| Mobile account menu 375 | PASS: rows 286×40, icons 3.38–21:1 | FAIL (pre-existing): focus escapes under the panel (F3) | SKIPPED |
| /compare (2 items, then cleared) | FAIL at 375: CLS 0.191 (F2). 1920: 0.043; All/Differences toggle 0 px shift | KNOWN: `scrollable-region-focusable` on tbody (VCST-5878) | SKIPPED |
| /cart | Empty cart only. FAIL at 375: CLS 0.472 (F2); 1920: 0.063 | PASS on the empty state | SKIPPED |

**vs. DESIGN: SKIPPED.** VCST-6626 has no Prototype or Claude Design link, so there is no project to diff against. This is not a PASS.
**B50 baseline: UNAVAILABLE.** No pre-merge Storybook is reachable on this stand, so no PIXEL diff is claimed. The invariant axes ran on the post-merge stories only.

## Findings

| # | Sev (proposed) | Invariant | Finding | Evidence |
|---|---|---|---|---|
| F1 | Medium (a11y, non-blocking) | BL-A11Y-003 / WCAG 1.4.3 | VcTileButton `solid--primary`: white text on `#f99e24` = **2.11:1**. `solid--secondary`: white on `#688198` = 4.05:1. Same values in dark mode. **Inherited, not new:** VcButton `solid--primary` in the same Storybook also measures 2.11:1. The kit's primary palette fails AA; the new tile reuses it. The storefront's Coffee primary `#e5451c` measures 4.03:1 (Sign in, Continue, Add passkey buttons). | axe on `components-molecules-vctilebutton--docs` and `vcbutton--basic` |
| F2 | Medium (BL-UI-001, ordinary finding) | BL-UI-001 CLS ≤ 0.1 | At 375 px, a full load of any short page shifts `.app-footer`. The shell paints the footer in view, then the page content and the footer link columns arrive. CLS: security 0.183, profile 0.215 (control page, not in this diff), empty cart 0.472, compare 0.191. At 1920 the same pages stay ≤ 0.063. This is global shell behaviour, so it is not specific to the merged /account/security. Whether the merge introduced it cannot be decided without a pre-merge build, so it is not attributed to the PR. KB-553F411E captured. | `screenshots/4v-sf-security-375-light.png` |
| F3 | Medium (a11y, non-blocking) | BL-A11Y-001, WCAG 2.4.3 / 2.4.11 | Open mobile menu (`.mobile-menu`: no `role=dialog`, no `aria-modal`, page behind not inert). Tab past "Saved credit cards" moves focus to "Add passkey" under the opaque panel, where it cannot be seen. Escape closes the menu and returns focus to Main menu. **Pre-existing:** KB-AD1902B5 (vc-frontend-next before the merge) and KB-2C150D2A (upstream 2.59), confirmed again on this build. | `screenshots/4v-sf-mobilemenu-375-focus-escapes.png` |
| F4 | Low (a11y) | BL-A11Y-003 | VcInput error state in dark mode: `#de3131` on `#0a090b` = 4.34:1 (text in input + message). Seen in the VcQuantityStepper `Errored` story; the colour comes from VcInput, not from the stepper diff. | axe on `vcquantitystepper--docs` (dark) |

## Advisory (not filed)

- VcTileButton `outline` tile border in dark is 1.45:1 against the page. The label and icon still identify the tile, so 1.4.11 does not strictly require a visible boundary.
- The VcStatWidget accent icon for primary/warning is ≈2.1:1 on white. It is decorative: the text label carries the meaning. The dark pending dash is `aria-hidden` (same as VCST-5903).
- /compare "Remove from compare" and "Add to cart" are named without the product name. This is the same pattern as KB-1A452441 (Security Edit/Delete). Not WCAG-failing, but below BL-A11Y-002's "contextual" bar.
- Breadcrumb "Home" is 39×17 and the compare product links are 16 px tall. They pass 2.5.8 through the spacing exception: WARN, not FAIL.
- Mobile menu: right after a pointer click, focus stayed on the Main menu button. KB-AD1902B5 says focus moves to the panel; the difference is noted in the kb confirm.

## Not concluded

- **KB-1A452441** (Security Edit/Delete names without the key name): **SKIPPED.** The test account has no passkeys. Adding one would change shared-account state while two other lanes run.
- **/cart sections:** only the empty state was audited. The account's cart is shared with the edge and firefox lanes, so no line was added.
- Screen-reader output, the WCAG 2.2 additions other than 2.5.8, and themes other than Coffee: manual, not concluded.

Cleanup: the compare list was cleared through Clear all → OK (0 of 5). The cart was untouched. Signed out through account menu → Logout.
