# VCST-4933 — UI/UX Lane (Step 4v RETRY): Page Builder — Shared Components

**Env:** vcptcore-qa (B2B-store) · **Lane:** `playwright-chrome` (Chrome DevTools MCP was blocked by profile contention on the prior attempt; not used here). Session was already authenticated as `admin` in an open tab — no login performed.

## Axis verdicts

| Axis | Verdict | Notes |
|---|---|---|
| A11Y — Shared Components workspace | **FAIL** (platform-level, not feature-own) | axe: `aria-required-children` (critical), `button-name` (critical), `color-contrast` (serious ×3), `html-has-lang` (serious), `meta-viewport` (critical) — all on generic VC Shell chrome (`.sidebar-header__menu-button`, `.vc-user-info__role`, `.vc-table-composition__row--header`, `<html>`, `<meta viewport>`), per BL-UI-007 scope note logged once against the platform, not this blade |
| A11Y — Angular Designer | **FAIL** (new, feature-own) | 0 hard violations; `incomplete`→confirmed real: `aria-prohibited-attr` (serious) — `aria-label` on a bare `<span class="shared-component-usage">` with no role; `color-contrast` inconclusive (occlusion) on tree item names + `.shared-component-badge` — manual verification needed |
| Keyboard walk — workspace grid | **PASS** | Tab reaches every row, Close, Used-on link, Rename in DOM/visual order; visible focus outline each step; disabled Delete correctly excluded from tab order (native semantics) |
| Keyboard walk — Designer section tree | **FAIL — CRITICAL (new)** | Full physical Tab walk from the toolbar (`Preview`→`Unpublish`→disabled `Publish`/`Save` skipped) lands **directly inside the canvas iframe's "Skip to main content" link** — Settings, Page Header, Text, and the Shared-component placement row (with its `tune`/`drag_indicator`/`add_circle` affordances) are **entirely absent from the Tab order**. Confirms the already-known "no aria-label" finding is worse than labeled: these controls are plain `cursor:pointer` divs with no `role`/`tabindex` at all |
| Escape-to-close | **FAIL (new)** | Neither the Component-details blade nor the Add-block panel closes on `Escape` (both left open through repeated presses) |
| `vs. DESIGN` | **SKIPPED** | All 16 tracker attachments unfetchable (expired token) — no spec source, independent of browser access |
| Design-system consistency | **PASS w/ note** | Icon family (`tune`/`link`/`construction`/`text_snippet`) matches the platform's existing Material-Symbols set; Shared Components toolbar (Refresh + Search only) is intentionally leaner than the established Draft-pages grid (Add/Refresh/Archive/Filters/checkboxes) — consistent scope reduction, not a defect |
| UX heuristics | **Mixed** | See findings below |
| State stress | **Partial PASS** | 0-usage, 1-usage, 3-usage rows all render correctly; Delete-disabled+reason renders correctly (visible text, not tooltip/colour-only); no 80-char-name fixture available to stress truncation — **not exercised** |

## BL-UI / BL-A11Y invariant breaches

- **BL-UI-007 (P1) — FAIL, Critical.** Designer section tree is keyboard-unreachable (see above). This is the root cause behind the previously-logged "icon-only controls have no aria-label" item — the controls aren't just unlabeled, they're outside the Tab order entirely. WCAG 2.1.1 (Keyboard, Level A).
- **BL-UI-004 (content boundary) — FAIL, new.** At 375 px, the floating "Refresh" FAB (`box 253,692,102,44`) overlaps the Component-details blade's "Rename" button (`box 17,690,342,36`) by ~102×34 px (screenshot `13-mobile-375-refresh-overlap.png`). Real tap-collision risk, not a screenshot-stitching artifact (confirmed via `browser_snapshot --boxes`).
- **BL-UI-001/002/003/005/006** — not stress-tested this run (time-boxed to the above); no verdict claimed.

## Assessment of already-known findings (severities)

| Known finding | Verdict / severity |
|---|---|
| `add_circle` insert icon intercepts pointer events over adjacent row | Confirmed pattern class (an overlay `app-add-section` panel-title also intercepted clicks over the tree while nominally "closed" via Escape — same root cause: overlay never actually closes). **Medium** — workaround exists (click elsewhere first), not blocking |
| Icon-only `tune`/`drag_indicator`/`add_circle` — no `aria-label` | Confirmed, and compounded by the Tab-order finding above. **Upgrade to High/Critical** (WCAG 2.1.1 + 4.1.2, BL-UI-007) |
| Plural-copy inconsistency for one fact | Confirmed with a **5th distinct wording** found this run: workspace column "Used on: 3", details blade "Used on (1 page)", tree badge text "Shared · 1", tree accessible-name "Used on 1 page(s)", canvas floating badge "Shared · Used on 1 page". The Add-block panel gets singular/plural grammatically right ("1 page" / "3 pages") while every other location doesn't. **Medium** — confusing, not blocking |
| Archive-confirm dialog: Cancel filled-primary, Confirm text-link | Not re-verified live this run (out of time-box); per WCAG/heuristic norms this is a **Medium** UX/error-prevention risk (visual hierarchy inverted for a destructive action) — recommend live re-check before filing at higher severity |
| Does the `Shared` badge convey more than icon/colour? | **Yes — PASS.** Visible text "Shared" (not only the link icon or green colour) plus an (albeit non-conformant, see `aria-prohibited-attr`) `aria-label="Used on N page(s)"` |
| Does Delete-disabled + reason reach assistive tech? | **Partial.** Reason is plain visible text (not tooltip/colour-only) — perceivable to sighted users and AT browse-mode reading. But no `aria-describedby` links it to the `Delete` button itself (button's accessible name is bare "Delete"). **Medium** |

## New findings this run

1. Designer section tree fully keyboard-unreachable (BL-UI-007, Critical — see above).
2. Mobile (375 px) Refresh FAB overlaps Rename button in the Shared Components details blade (BL-UI-004, Medium-High).
3. `Escape` does not close either overlay panel in this feature (Medium).
4. `aria-label` used on a bare `<span>` with no role for the Shared badge — axe `aria-prohibited-attr`, serious (Medium).
5. Tree item titles render literal `"(undefined)"` in their `title`/accessible-name attribute (e.g. `title="Settings (undefined)"`) though the visible text is clean ("Settings") — a broken string-interpolation only surfaces to assistive tech / hover tooltips. **Medium** (confusing AT/tooltip output, WCAG 4.1.2 adjacent).

## Screenshots

`reports/tickets/Sprint26-19/VCST-4933/screenshots/` — workspace grid, details blade (used/undeletable), keyboard-focus walk (7 steps), Designer tree + green preview boundary, Add-block panel (Shared Blocks Library group), mobile 375 px workspace + FAB/Rename overlap, Designer keyboard walk into iframe.

## Not exercised (time-boxed)

Long-name/12-digit-SKU truncation (no fixture), full contrast measurement of the Shared badge and tree item text (axe returned `incomplete` due to element occlusion — needs a manual DevTools contrast pick), archive-confirm dialog live re-check, cross-browser (Firefox excluded per brief; Edge not run this pass).
