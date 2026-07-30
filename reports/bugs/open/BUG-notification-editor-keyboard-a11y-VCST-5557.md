# Notification editor's new chrome is keyboard-inaccessible: tabs unreachable, help toggles unfocusable, no focus indicator

## Status: CONFIRMED

**JIRA:** VCST-5605 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** High (accessibility) · **Found during:** `/qa-test VCST-5557` · **Introduced by PR #202**

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

## Summary

The tabbed workspace introduced by PR #202 cannot be operated by keyboard. The three tabs are non-interactive `<li>` elements with `ng-click`, so a Tab walk never reaches them — making Sample data and Preview unreachable without a mouse. The `?` help toggles are likewise unfocusable and invisible to assistive tech, and the full-screen button has no visible focus indicator. All findings are on markup this PR added; pre-existing platform and CodeMirror-library violations were filtered out.

## Steps to reproduce

1. Admin → **Notifications** → an Email notification → Templates → open a template.
2. Click into the **Subject** field, then press **Tab** repeatedly and record where focus lands.
3. Tab to the full-screen button and look for a focus ring.
4. Try to reach and activate the **Sample data (json)** tab using only the keyboard.

**Expected:** the tab switcher is focusable and operable by keyboard (`role="tablist"`/`role="tab"`, arrow-key or Enter/Space activation), and every interactive control shows a visible focus indicator.

**Actual:** the Tab order runs Subject → Language → Layout → full-screen button → Format HTML. **No tab is ever focused**, so the tabbed editor is mouse-only.

## Findings

| # | Finding | Criterion | Measured |
|---|---------|-----------|----------|
| 1 | Tab switcher unreachable and unannounced — `<li class="nt-tab">` with `ng-click`; `tabindex` null, `role` null, no `aria-selected`, no `role="tablist"` on the `<ul>` | 2.1.1, 4.1.2 | empirical 5-step Tab walk |
| 2 | `?` help toggles (12×14px `<i class="fa fa-question-circle">`) not focusable and `ignored` in the accessibility tree (no role, no accessible name) — the only affordance for field help | 2.1.1, 4.1.2, 2.5.8 | DOM + verbose a11y snapshot |
| 3 | `.nt-fs-btn` has no visible focus indicator — while focused: `outline-style: none`, `box-shadow: none`, no colour change; only a `:hover` rule exists | 2.4.7 | computed style while focused |
| 4 | New `.nt-preview-frame` iframe has no `title`/`aria-label` — the one **new** axe violation (`frame-title`, serious) | 4.1.2 | axe-core 4.12.1 |
| 5 | "Hide" description link `#43b0e6` on white = **2.44:1** (needs 4.5:1) | 1.4.3 | computed contrast |
| 6 | `?` icon `#b8d0df` on white = **1.60:1** (needs 3.0:1) — a nearly invisible affordance | 1.4.11 | computed contrast |
| 7 | Active tab `#1a73e8` = **4.51:1** — passes by 0.005, no headroom | 1.4.3 | computed contrast |

`.nt-fs-btn` target size (36.3 × 26 px) passes 2.5.8.

The affected chrome — the three `<li>` tabs, the `?` toggles beside each label, and the full-screen button at the right of the tab bar:

![Header row and tab bar showing the tabs, ? toggles and full-screen button](../../tickets/Sprint26-15/VCST-5557/screenshots/A1-header-row-and-tabs.png)

*Jira: attached as `A1-header-row-and-tabs.png` (id 80153).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** | measurements above |
| 3. GraphQL xAPI | N/A | markup only |
| 4. Platform REST API | N/A | markup only |

**Owning layer:** Layer 2 — Admin SPA.

## Root Cause Analysis

In `notifications-edit-template.tpl.html` the tab switcher is built from plain list items:

```html
<ul class="nt-tabs" ng-if="!blade.fullscreen">
    <li class="nt-tab" ng-class="{'__active': blade.activeTab === 'template'}" ng-click="setActiveTab('template')">
```

`<li>` is not focusable and `ng-click` adds no keyboard handling, ARIA role, or tabindex. The `?` toggles use the same pattern on an `<i>` element. `styles.css` styles `.nt-tab:hover` and `.nt-fs-btn:hover` but defines no `:focus` / `:focus-visible` rule.

**Suggested fix:** give the `<ul>` `role="tablist"` and each item `role="tab"`, `tabindex` (0 for active / -1 for the rest), `aria-selected`, and Enter/Space + arrow-key handling — or render them as `<button>`s. Make the `?` toggles real `<button>`s with an `aria-label` and an accessible hit area. Add `:focus-visible` styles for `.nt-tab` and `.nt-fs-btn`. Add a `title` to the preview iframe. Darken `#43b0e6` and `#b8d0df` to meet 4.5:1 / 3.0:1.

## Notes

- **Explicitly excluded as pre-existing / library, not this PR:** CodeMirror gutter line numbers `#999` (2.65–2.85:1, 24 of 27 contrast nodes), the platform `ui-select` "Please select…" placeholder `#999`, CodeMirror's unlabelled internal `<textarea>` (`label`, critical) and `.CodeMirror-scroll[tabindex=-1]` (`scrollable-region-focusable`), and "Format HTML" white-on-`#43b0e6` (injected inline from JS, not in the module stylesheet). axe found **zero** contrast violations on the PR's own `nt-*` chrome.
- Screen-reader confirmation (NVDA/JAWS/VoiceOver) was not available in the toolkit — findings 1, 2 and 4 rest on DOM inspection, the accessibility tree and an empirical Tab walk.
- `Esc` while the autocomplete dropdown is open in full-screen closes the dropdown **and** exits full-screen in one keypress (minor UX, tracked in the minor-findings report).

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS)
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade tab bar, help toggles, full-screen button, preview iframe
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.tpl.html` → `<ul class="nt-tabs">` / `<li class="nt-tab" ng-click="setActiveTab(…)">`, `<i class="form-ico fa fa-question-circle" ng-click="…">`, `<iframe class="nt-preview-frame">`; styles in `src/VirtoCommerce.NotificationsModule.Web/Content/css/styles.css` (`.nt-tab`, `.nt-fs-btn` — `:hover` only, no `:focus`)
- **Routing confidence:** HIGH

## Verification 2026-07-30

**Verdict: PARTIAL FIX** — re-ran STR live on vcst-qa @ `VirtoCommerce.Notifications 3.1013.0-pr-202-b644` (current HEAD of PR #202; fix landed in-flight on the same PR, not a separate fix PR — ticket stayed in Draft).

Fixed (live-confirmed): #1 tab switcher (`role="tablist"/"tab"`, roving `tabindex`, `aria-selected`, arrow-key activation confirmed via keyboard walk — ArrowRight moved and activated focus from "Template (liquid)" to "Sample data (json)"), #3 focus-visible outline on tabs/`.nt-fs-btn`, #4 iframe `title`, #5 "Hide" link contrast (`#1565c0`, ~5.75:1), #7 active-tab contrast headroom.

Still open (live-confirmed unchanged): #2 the three `?` help toggles remain unfocusable `<i>` elements (Tab walk still skips Subject/Language/Layout `?` icons entirely), #6 icon contrast (`__lightblue`, ~1.6:1) has no override.

Full detail: JIRA comment on VCST-5605, 2026-07-30. Left in `open/` — not fully resolved.
