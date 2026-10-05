# VCST-6012: Bug-fix verification, Page Builder Designer accessibility

**Verdict: PARTIAL.** Findings 1, 2, 3, 4, 5b and 5c are fixed (STR 3/3). Finding 5a still FAILS: Refresh is now hidden at 375px, but the **AI Assistant** floating button covers the right ~37% of Rename. One new low-severity defect was found (the CDK live announcer is visible).

| | |
|---|---|
| Env | vcptcore-qa · Platform 3.1072.0 · VirtoCommerce.PageBuilderModule **3.1030.0-pr-165-1ab4** (PR #165 @ 1ab4e68) · vc-shell framework 2.6.0 |
| Fixture | PB_SC_CONSUMER_A, "AGENT-TEST-SC-Consumer-A" (`/agent-test-sc-consumer-a`, group 45904b38-…), B2B-store. Sections: text01 · Shared "AGENT-TEST-SC-Multi-Trio" (Used on 3) · text03 |
| Browser | playwright-edge (Edge 154), 1920x1080, plus 375x812 for step 7. Keyboard input was real `press_key` only. Read-only `getComputedStyle`/axe evaluation was used for measurement |
| Date | 2026-10-01, ~16:03–16:19 UTC |
| Data safety | Nothing was saved or published. After each run the page was reloaded and the order checked: text01 → Shared → text03, Save/Publish disabled. Rename was opened and then cancelled with Escape |

## Per-run results (STR = full sequence, fresh Designer reload each run)

| Finding | Run 1 | Run 2 | Run 3 |
|---|---|---|---|
| 1 Tab reaches the tree before the iframe, focus visible | PASS (26 stops) | PASS (26 stops) | PASS (26 stops) |
| 2 Icon-only controls have names | PASS (31 controls, 0 nameless/ligature) | PASS | PASS |
| 3 Shared badge semantics, axe aria-prohibited-attr = 0 | PASS | PASS | PASS |
| 4 No "undefined" in title / aria-label / text | PASS (0) | PASS (0) | PASS (0) |
| 5b Escape (Add block / section editor) + focus restore | PASS | PASS (dropdown confirmed open → Esc 1 closes it, Esc 2 closes editor) | PASS |
| 5c Row-centre click opens the correct editor | PASS (text03) | PASS (Shared ref01) | PASS (text01) |
| Keyboard reorder (ArrowUp/Down), focus stays on the handle | PASS | PASS | PASS (2× Up + no-op at top boundary) |

Steps 5 (Shared Components part) and 7 (375px) were run once, after run 3.

**Tab order observed (identical in all 3 runs):** Desktop › Anonymous › Pages › Theme settings › Preview › Unpublish › **Page actions › Settings › Page Header › Insert section at the beginning › [Select Text ☐] › Text › Actions for Text › Move section 1 › Insert section after section 1** › … the same pattern for the Shared row and text03 … › Insert section after section 3 › Add block › **IFRAME "Storefront page preview"**. Every button stop showed a solid 1.6px rgb(22,101,216) outline.

## Verification checklist

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Tree + per-row controls reachable by Tab before the iframe, visible focus (BL-UI-007, WCAG 2.1.1) | **PASS** 3/3 | Focus log above; GREEN-01/02/03 |
| 2 | Icon-only controls have accessible names (WCAG 4.1.2) | **PASS** | Ligature glyphs are `aria-hidden`. Names: "Actions for <name>", "Move section N", "Insert section after section N", "Page actions" |
| 3 | Shared badge semantics; axe aria-prohibited-attr = 0 | **PASS** | Badge is a roleless `<span title="Used on 3 page(s)">` with `aria-hidden` "· 3" and `.sr-only` "Used on 3 page(s)". Button name: "AGENT-TEST-SC-Multi-Trio Shared Used on 3 page(s)". axe: 0 aria-prohibited-attr / button-name / nested-interactive (axe-designer-run1.json) |
| 4 | No "(undefined)" in any title or accessible name | **PASS** | Row titles are now "Text (text01)", "AGENT-TEST-SC-Multi-Trio (agsc-pb-sc-consumer-a-ref01)", "Text (text03)" |
| 5 | 375px: Refresh does not overlap Rename (BL-UI-004) | **FAIL** | Refresh is hidden (fixed as claimed), but the **AI Assistant** FAB box 227,692,128×44 overlaps Rename 17,690,342×36. Hit-test at y=708: x=100 and 188 hit Rename; x=250, 300 and 340 hit AI Assistant. Rename is still clickable at its centre. FAIL-10 |
| 6 | Escape closes Add block, section editor, Component details, Rename; focus restored | **PASS** | Add block → focus on "Add block". Editor → focus on the row button. Component details → focus on the grid row. Rename dialog → focus on "Rename" |
| 7 | Row-centre click opens the correct editor; insert affordance does not intercept (BL-UI-003) | **PASS** 3/3 | `elementFromPoint` at the row centres hits `span.name`. Insert buttons (28×24 at x=178) do not intercept non-hovered rows. Normal clicks routed to `#/pages/text03`, `/agsc-…-ref01`, `/text01` |
| 8 | Mouse drag-and-drop still works (then discarded) | **PASS** | text03 was dropped at position 1 (GREEN-06), then discarded and the order verified. Tooling note: Playwright's single-call `browser_drag` timed out mid-gesture (CDK needs stepped moves); the drop completed after hover + release |
| 9 | Section editor opens and fields edit (right edge clickable); preview renders; no new console errors | **PASS** | Title field accepted text and was not saved. Hit-test at x=396 hits the input / ng-select arrow. Preview iframe rendered and scrolled to the selected section. Console: no Designer errors (only the known shell `[auth-bridge] impersonate grant failed 401` on /connect/token, plus GA collect connection noise) |
| 10 | Shared Components workspace (adjacent VCST-6011, note only) | Note | Delete is a native `disabled` button, so it is out of the Tab order. The Rename/Escape flow works. I did not do a full workspace Tab walk or open the page actions menu |

## Before → after (RED baseline 3.1025.0-pr-159 vs now 3.1030.0-pr-165)

| Aspect | RED baseline | Observed now |
|---|---|---|
| Tab after Unpublish | "Skip to main content" inside the preview iframe (tree skipped) | Page actions → Settings → … → Add block → iframe |
| Tree controls | `cursor:pointer` divs, no role/tabindex | Native `<button>`s with names; `<input type=checkbox>` for Select |
| tune / drag_indicator / add_circle | Only ligature text exposed | `aria-hidden` icon inside a named button |
| Shared badge | `aria-label` on a roleless span (axe aria-prohibited-attr) | `title` + `.sr-only` text; axe 0 |
| Tree item title | "Settings (undefined)" | "Text (text01)" etc. 0 "undefined" document-wide |
| 375px overlap | Refresh FAB 253,692,102×44 over Rename 17,690,342×36 | Refresh hidden; **AI Assistant FAB 227,692,128×44 over Rename 17,690,342×36** |
| Escape | Closed neither Component details nor Add block | Closes all four surfaces; focus restored |
| add_circle | Intercepted clicks over the centre of the adjacent row | No interception at row centres |

## New defect (not in the ticket's scope)

**NEW-01 (Low): the reorder live-region text is visible and adds a page scrollbar.** After a keyboard reorder, `<div class="cdk-live-announcer-element cdk-visually-hidden" aria-live="polite">Section moved to position 2 of 3</div>` computes to `position: static`, clip auto, 1904.8×20 at y=1080. Document height becomes 1100 against a 1080 viewport, so a vertical scrollbar appears and the viewport width drops to 1905. The Angular CDK a11y visually-hidden stylesheet is not loaded in the Designer bundle. Screenshot: NEW-01.

**Advisory (no verdict impact):** the focus indicator on the "Select <name>" checkbox is only Material's 12%-black state-layer circle (low contrast, GREEN-07). axe's remaining moderate findings are Designer page structure (landmark-one-main, page-has-heading-one, region ×2 on `.template-name` "[no name]" and the sections group). They are Designer-owned and pre-existing in kind, not caused by this fix. Leaving with unsaved changes showed no unsaved-changes prompt.

## Evidence (screenshots/)

GREEN-01-run1-tab-settings-focus.png · GREEN-02-run1-tab-mid-tree-focus.png · GREEN-03-run1-tab-last-stop-before-iframe.png · GREEN-04-run1-arrowup-reorder-focus-kept.png · GREEN-05-run1-add-block-open.png · GREEN-06-run1-mouse-dnd-unsaved.png · GREEN-07-run2-select-checkbox-focus.png · GREEN-08-run2-row-click-shared-editor.png · FAIL-10-375-ai-assistant-fab-overlaps-rename.png · NEW-01-live-announcer-visible-page-overflow.png · baseline/RED-*.png (pre-fix). axe: `axe-designer-run1.json` (runs 2 and 3 gave identical violation sets). HAR: not recorded on this lane. Failed network: none on /api (all 200).

KB (queued): KB-FA3338C3 (Designer keyboard model), KB-EDF22BE8 (Shared Components Escape + 375px FAB). Related existing entry: KB-E423C32F.
