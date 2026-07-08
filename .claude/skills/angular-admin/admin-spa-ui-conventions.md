# Admin SPA UI Conventions — canonical layout/CSS patterns for module blades

The Virto Commerce Platform Admin SPA (the back-office "Manager") is **hand-written AngularJS 1.x served
as static assets** — no bundler, no Storybook, no component gallery. Every `vc-module-*` Admin UI ships
its own `*.tpl.html` blades and reuses the **platform's shared stylesheet**. The platform CSS is the only
real style guide, and **this file is its catalog**: for any UI element you must fix, find the matching
entry here, then **mirror a canonical sibling blade** rather than inventing layout with inline styles.

> **Why this file exists.** [vc-module-export PR #101](https://github.com/VirtoCommerce/vc-module-export/pull/101)
> took 5 commits + a dismissed review to fix one toolbar bug because the fixer didn't know these classes
> existed and reinvented layout with `style="position:absolute; left:220px; width:190px"` +
> `ng-style="{'height':'140px'}"`. The correct fix uses platform classes (`searchrow`, `column-half`,
> `filter-edit`) for the toolbar AND **reserves enough `blade-static` height for the note** (it is
> fixed-height — see §2.1; the original height reservation was right, only doing it inline was wrong).
> **Discover-first, mirror, MEASURE the result (§4) — never inline-position, never guess geometry.**

Used by `/angular-admin`, `fullstack-backend`, `backend-reviewer`, and `qa-backend-expert`. Pair with
`vc-module-architecture.md` §2 (Admin UI ships in the module repo) and the `/angular-admin`
`css-layout-patterns.md` (before/after recipes) + `visual-render-harness.md` (pre-PR visual proof).

---

## 0. The two iron rules (every layout/CSS fix)

1. **Never use inline layout.** No `style="position:absolute|fixed"`, no fixed-px `width`/`height`/`left`/`top`,
   no `ng-style="{'height':'…px'}"`. Layout comes from platform classes; the layout engine sizes things.
2. **Mirror, don't invent.** Before editing a blade's markup, `Grep` for an existing blade that already
   renders the same element correctly and copy its class structure. The platform has a canonical pattern
   for nearly everything below.

A diff that adds inline positioning or fixed pixels to a blade template is a **Gate-4 reject**
(`backend-reviewer`).

---

## 1. Where the styles live

| Source | Path (in `vc-platform`) |
|--------|--------------------------|
| Shared SCSS (authoring) | `src/VirtoCommerce.Platform.Web/wwwroot/css/themes/main/sass/` |
| Blade structure | `…/sass/blade-constructor.scss` (`.blade-static`, `.blade-static.__bottom`, `.form-count`) |
| Layout / columns / lists | `…/sass/modules/_base-modules.sass` (`.column*`, `.searchrow` sizing, `.list`, `.inner-block`) |
| Forms / inputs / buttons | `…/sass/modules/_forms.sass` (`.form-group`, `.form-input.__*`, `.btn`, `.btn-ico`, `.filter-edit`) |
| Buttons | `…/sass/modules/_vc-button.sass` |
| Checkboxes | `…/sass/modules/_vc-checkbox.sass` (`.vc-checkbox*`) |
| Reusable filter panel | `…/sass/modules/_va-filter-panel.sass` + `wwwroot/js/common/directives/filterPanel.{js,tpl.html}` |
| Grid | `…/sass/modules/_ui-grid.sass` |
| Dialogs | `…/sass/modules/_dialogs.sass` (modern `.modal-window`), `_window-modals.sass` (legacy `.window`) |
| Compiled output (what the browser loads) | `src/VirtoCommerce.Platform.Web/wwwroot/css/platform.css` |

A module's blade markup never imports CSS — it just uses the classes the platform already ships. For the
visual render harness, pull the live `platform.css` from the QA platform (`{BACK_URL}/…/platform.css`) or the
cloned `vc-platform` checkout.

---

## 2. Element catalog

Each entry: **canonical structure → correct snippet → reference blade → anti-pattern.** Class names and
snippets are taken from live VirtoCommerce source (vc-platform + the modules noted). Verify the exact
current markup in the cited blade before mirroring (templates drift).

### 2.1 Blade skeleton & sizing

Every blade is: an optional fixed top `blade-static` (search/filter), an optional fixed `blade-static __bottom`
(create / ok-cancel / pager), and the scrollable `blade-content → blade-inner → inner-block`.

```html
<div class="blade-static">                         <!-- fixed top: search/filters. FIXED height 70px (NOT auto) -->
    <div class="form-group searchrow"> … </div>
</div>
<div class="blade-static __bottom"                  <!-- fixed bottom: actions / pager -->
     ng-include="'$(Platform)/Scripts/common/templates/ok-cancel2.tpl.html'"></div>
<div class="blade-content __medium-wide">           <!-- size modifier optional -->
    <div class="blade-inner">
        <div class="inner-block">
            <!-- grid / form / list -->
        </div>
    </div>
</div>
```

- **Size modifiers** on `blade-content` (mutually exclusive, omit for normal width): `__medium-wide`,
  `__large-wide`, `__xlarge-wide`. Use a wider blade for multi-column grids.
- **`blade-static` is FIXED-height, NOT auto-sizing** (default `height: 70px`, `overflow: visible`) — and
  `blade-content` flows in directly at that fixed bottom. So its content must FIT in the reserved height; if
  it doesn't, the content **overflows and overlaps the grid/content below**. This is the real
  [VCST-5276 / PR #101](https://github.com/VirtoCommerce/vc-module-export/pull/101) cause (verified by live
  DevTools measurement 2026-06-17): a one-row toolbar fits 70px, but an `.__note` message stacked **above**
  the `searchrow` needed ~136px → the searchrow spilled past the 70px box onto the grid header.
  - **One toolbar row** (just a `searchrow`) → the default 70px is correct; do nothing.
  - **More than one row** (e.g. an info note above the searchrow, or a multi-row filter) → you MUST give
    `blade-static` enough height. Reserve it with a **class**, not inline `ng-style`: conditionally apply
    `__expanded` (`ng-class="{'__expanded': blade.someCondition}"`) — or, cleanest, **move the non-toolbar
    content (an info note) out of `blade-static` into the top of `blade-content`/`blade-inner`** so the
    toolbar stays one row. (The original PR #101 instinct — reserve height — was right; doing it via inline
    `ng-style="{'height':'140px'}"` was the only wrong part. Removing the reservation entirely re-broke it.)
- **Bottom toolbar** is an `ng-include` of a shared template — `create.tpl.html` (single Create),
  `ok-cancel2.tpl.html` (Cancel + OK), `ok.tpl.html`. Don't hand-roll the buttons.
- Reference: `vc-module-pricing/.../Scripts/blades/pricelist-list.tpl.html` (list — a single-row toolbar that
  fits the default 70px and shows no note), `pricelist-detail.tpl.html` (detail).
- **Anti-pattern:** **inline `ng-style="{'height':'…px'}"`** with a magic number (use the `__expanded` class
  or move content out instead); cramming a note **plus** a searchrow into the default 70px `blade-static`
  (overflow → overlap); omitting the `blade-inner → inner-block` wrapper; hardcoded pixel widths instead of a
  `__*-wide` modifier.

### 2.2 Search box

```html
<div class="form-group searchrow">
    <div class="form-input __search column">      <!-- or column-half when paired with a filter -->
        <input placeholder="{{ 'platform.placeholders.search-keyword' | translate }}"
               ng-model="filter.keyword"
               ng-keyup="$event.which === 13 && filter.criteriaChanged()">
        <button class="btn __other" title="Clear"
                ng-click="filter.keyword=null;filter.criteriaChanged()">
            <i class="btn-ico fa fa-remove"></i>
        </button>
    </div>
</div>
```

- `form-input __search` reserves right padding for the clear button; the `btn __other` holds the icon.
- Reference: platform `wwwroot/js/app/settings/blades/setting-dictionary.tpl.html`; `vc-module-pricing`
  `pricelist-list.tpl.html`.
- **Anti-pattern:** `<input style="width:190px">` + an absolutely-positioned clear button. Use the
  `form-input __search` wrapper — it handles width (via `column*`) and button placement.

### 2.3 Filter toolbar (search + dropdown + edit) — the PR #101 pattern

```html
<div class="blade-static">
    <div class="form-group searchrow">
        <div class="form-input column-half">
            <input placeholder="{{ 'platform.placeholders.search-keyword' | translate }}"
                   ng-model="filter.keyword">
            <button class="btn __other" title="Clear" ng-click="filter.keyword=null"></button>
        </div>
        <ui-select class="column-half" ng-model="filter.current" ng-change="filter.change()">
            <ui-select-match allow-clear="true"
                placeholder="{{ 'export.blades.export-generic-viewer.placeholders.select-filter' | translate }}">
                {{$select.selected.name | translate}}
            </ui-select-match>
            <ui-select-choices repeat="x in exportSearchFilters | filter: $select.search">
                <span ng-bind-html="x.name | translate | highlight: $select.search"></span>
            </ui-select-choices>
        </ui-select>
        <a href="" class="filter-edit" ng-click="filter.edit()"><i class="fa fa-pencil"></i></a>
    </div>
</div>
```

- `searchrow` is a flex row; `column-half` (≈47% + gutter) / `column-third` / `column` split the width.
  `filter-edit` is the pre-styled pencil link (no manual offset needed).
- Reference (canonical): `vc-module-pricing/.../Scripts/blades/assignment-list.tpl.html`.
- **Anti-pattern (the actual PR #101 bug):**
  ```html
  <input style="width:190px">
  <ui-select style="left:220px;position:absolute;width:190px;top:0px">
  <a style="left:416px;position:absolute">
  ```
  → replace with `searchrow` + `column-half` + `filter-edit` (above).

### 2.4 Reusable filter panel (`va-filter-panel`)

For a collapsible multi-criterion filter with an active-state badge, use the platform directive instead of
building filter rows by hand:

```html
<va-filter-panel has-active-filters="filter.hasActiveFilters()"
                 on-clear-filters="filter.clearFilters()"
                 search-text="blade.searchText"
                 filter-title="{{ 'platform.blades.operation-list.filter.title' | translate }}">
    <div class="va-filter-panel__row">
        <span class="va-filter-panel__label">{{ 'platform.blades.operation-list.filter.operation-type' | translate }}</span>
        <select class="va-filter-panel__select" ng-model="filter.operationType" ng-change="filter.criteriaChanged()">
            <option ng-repeat="t in blade.operationTypes" value="{{t.value}}">{{ t.label | translate }}</option>
        </select>
    </div>
</va-filter-panel>
```

- Directive + template: `wwwroot/js/common/directives/filterPanel.{js,tpl.html}`; styles `_va-filter-panel.sass`.
  It renders its own search box + filter button + popup; you only supply the `__row`s.
- Reference: `vc-module-order/.../Scripts/blades/customerOrder-change-log.tpl.html`.
- **Anti-pattern:** re-implementing the filter button/badge/popup markup by hand.

### 2.5 Drop-downs

- **Searchable / async** → `ui-select` (`ui-select-match` + `ui-select-choices`), as in 2.3. Size with a
  `column-*` class, never inline px.
- **Static option list** → native `<select class="va-filter-panel__select">` inside a `va-filter-panel__row`,
  or a plain `<select>` inside a `form-input` for a form field.
- Reference (ui-select async): `vc-module-store/.../Scripts/directives/uiScrollStore.tpl.html`.
- **Anti-pattern:** `style="width:190px;position:absolute"` on a `ui-select`.

### 2.6 Form inputs & variants

```html
<div class="form-group">
    <label class="form-label">{{ 'core.blades.currency-detail.placeholders.exchange-rate' | translate }}</label>
    <div class="form-input __number">
        <input smart-float num-type="float" fraction="4" min="0.0001" required
               ng-model="blade.currentEntity.exchangeRate">
    </div>
</div>
```

`form-input` variants position the affordance for you — pick the right one instead of nudging an icon with
inline CSS:

| Variant | Use | Affordance |
|---------|-----|-----------|
| `__search` | text search | clear button, right |
| `__calendar` | date picker | calendar icon, right |
| `__currency` | money amount | currency symbol (`<span class="currency">USD</span>`), right |
| `__number` | numeric | up/down spinners, right |
| `__file` | file upload | upload icon, right |
| `__langs` | localized field | flag + lang code, left |
| `__mini` / `__inline` | compact / inline | narrower / inline-block |

- Reference: `vc-module-core/.../Scripts/currency/blades/currency-detail.tpl.html`.
- **Anti-pattern:** absolutely-positioned icons/affordances; use the variant class.

### 2.7 Buttons & action toolbars

```html
<button class="btn" ng-click="blade.save()" ng-disabled="formScope.$invalid">
    <span>{{ 'platform.commands.save' | translate }}</span>
</button>
<button class="btn __cancel" ng-click="blade.cancel()"><span>{{ 'platform.commands.cancel' | translate }}</span></button>
<button class="btn"><i class="btn-ico fa fa-remove"></i></button>   <!-- icon button -->
```

- Real modifiers: `__cancel` (gray/secondary), `__other` (icon button inside a `form-input`),
  `__loading` (striped busy state — use alone). Icons inside buttons use `btn-ico`.
- **There is no `__save` / `__add` modifier** — a primary action is just `btn`. Disable with `ng-disabled`,
  not a class.
- Bottom toolbars: prefer the shared `ng-include` templates (2.1) over hand-rolled button rows.
- **Anti-pattern:** inventing `btn __save`/`btn __add`; combining `__loading` with other modifiers; managing
  disabled state via CSS class.

### 2.8 Grids / tables

```html
<div class="table-wrapper" ng-if="blade.currentEntities.length"
     ng-init="setGridOptions({ data: 'blade.currentEntities', columnDefs: [ … ] })">
    <div ui-grid="gridOptions" ui-grid-auto-resize ui-grid-selection
         ui-grid-resize-columns ui-grid-pinning ui-grid-height></div>
</div>
<div class="note" ng-if="!blade.currentEntities.length">{{ 'platform.list.no-data' | translate }}</div>
```

- Data grids use **ui-grid** (v3.x) inside `table-wrapper`, not raw `<table>`. Cell content goes in
  `.ui-grid-cell-contents`; item title/description use `.inner-t` / `.table-descr`. Empty state is `.note`.
- Reference: `vc-module-pricing/.../Scripts/blades/pricelist-list.tpl.html`.
- **Anti-pattern:** raw `<table>` for data; a grid without `table-wrapper`; custom column widths via inline CSS
  instead of `columnDefs` + `ui-grid-resize-columns`.

### 2.9 Checkboxes / toggles / radios

```html
<div class="vc-checkbox">
    <input class="vc-checkbox__input" type="checkbox" id="opt-1" ng-model="blade.entity.flag">
    <label class="vc-checkbox__label" for="opt-1">{{ 'module.fields.flag' | translate }}</label>
</div>
```

- Canonical class is `vc-checkbox` (`_vc-checkbox.sass`); always pair `__input` with a `for`-bound `__label`.
  Some older blades still use the legacy `form-control __checkbox` (`<span class="check"></span>`) — match
  whatever the file you're fixing already uses; don't mix.
- Grid row selection is handled by `ui-grid-selection` (don't hand-roll row checkboxes).
- **Anti-pattern:** bare `<input type="checkbox">` with no `vc-checkbox`/`form-control` wrapper; custom-styled
  checkbox via inline CSS.

### 2.10 Dialogs / confirmations

Don't hand-build modal DOM — invoke a service:

```js
dialogService.showConfirmationDialog({
    id: 'confirmDelete',
    title: 'module.dialogs.delete.title',
    message: 'module.dialogs.delete.message',
    callback: function (ok) { if (ok) { … } }
});
// full slide-in panel:
bladeNavigationService.showBlade({ id, template, controller }, parentBlade);
```

- The platform renders the modern `.modal-window` (`_dialogs.sass`) structure; legacy blades may show
  `.window` (`_window-modals.sass`). Use the service; only touch modal markup if the bug is in a custom
  dialog template already in the repo.
- Reference: usages of `dialogService` / `bladeNavigationService.showConfirmationDialog` across modules.
- **Anti-pattern:** native `<dialog>`; mixing `.window` + `.modal-window`; a dialog with no backdrop.

### 2.11 Widgets

Module widgets live under `Scripts/widgets/*.tpl.html` and render inside the platform's widget container
(the platform supplies the chrome; the template supplies the body). Match the markup of an existing widget
in the same or a sibling module rather than inventing a container.

- **Anti-pattern:** a bespoke widget shell with custom positioning. Mirror an existing widget template.

### 2.12 Lists, count badges, breadcrumbs, pager

- **Non-grid list / descriptive text:** `list` (+ `__info`) with `list-t` (title) / `list-descr` (gray
  secondary). Reference: `vc-module-pricing/.../Scripts/blades/assignment-detail.tpl.html`.
- **Count badge:** `form-count` (positioned by the platform — don't re-position with `position:absolute`).
- **Breadcrumbs / pager:** rendered by the platform (`breadcrumbs.tpl.html`; pager via the bottom
  `ng-include="'pagerTemplate.html'"`). Don't hand-roll either.

---

## 3. Discovery recipe (do this before editing any blade markup)

1. **Identify the element** you're fixing (toolbar? dropdown? grid? checkbox?).
2. **Find its entry above** for the class vocabulary + reference blade.
3. **Grep for a live canonical example** in the workspace and read it:
   - `Grep -g "**/*.tpl.html" "searchrow"` → filter/search toolbars
   - `Grep -g "**/*.tpl.html" "ui-select"` → dropdowns
   - `Grep -g "**/*.tpl.html" "blade-static __bottom"` → bottom action bars
   - `Grep -g "**/*.tpl.html" "table-wrapper"` / `"vc-checkbox"` / `"va-filter-panel"` → grids / checkboxes / filter panels
   Prefer a sibling blade in the **same module**; fall back to `vc-module-pricing` (richest canonical set) or
   `vc-platform` core blades.
4. **Mirror** that structure into the file you're fixing; reuse the classes verbatim.
5. **Audit your own diff** for the §0 anti-patterns (inline `position`, fixed px, inline `ng-style` height).
6. **MEASURE the result (§4)** — never declare a layout fix done on a screenshot or a guess; require the
   numeric overlap/alignment assertion to pass.

There is **no Storybook/component gallery** for the Admin SPA — this catalog plus the canonical reference
blades are the style guide.

---

## 4. Verifying a layout/CSS fix — MEASURE, don't eyeball

**A screenshot can lie.** On VCST-5276 a render-harness screenshot reported PASS while the live blade still
overlapped (the harness rendered a no-note case; ui-grid never re-laid-out). Eyeballing a thumbnail also
missed a 24px overlap. So a layout/CSS fix is **not** "done" until the geometry is **measured** and the
overlap/alignment assertion passes numerically.

**Step 1 — measure the live blade in a browser (read-only; allowed by the real-user hook).** Use the shared,
**generic** helper `bladeStaticOverflowSnippet()` from
[`scripts/lib/measure-layout.ts`](../../../scripts/lib/measure-layout.ts) (don't hand-roll a one-off — it
works for any module's blade, not just export/catalog). Get the snippet string, pass it verbatim to Chrome
DevTools `evaluate_script` or Playwright `browser_evaluate` (it uses only `getBoundingClientRect` /
`getComputedStyle`, the read-only ops the hook permits), then classify with `classifyBladeStaticOverflow`:

```ts
import { bladeStaticOverflowSnippet, classifyBladeStaticOverflow } from "scripts/lib/measure-layout";
// optional: pass a blade-header substring to target a specific blade; omit to auto-pick
const result = await browser_evaluate(bladeStaticOverflowSnippet("Select data to export"));
const finding = classifyBladeStaticOverflow(result);   // PASS | FAIL with overflowPx + offender
```

**Step 2 — the universal assertion** (works for any toolbar shape — searchrow, multi-row filter, note):
`bladeStaticContentBottom <= bladeContentTop` → `overflowPx === 0`, i.e. the **real content bottom of the
fixed-height `.blade-static`** must sit above `.blade-content`'s top. Measure the **failing** state first
(expect `overflowPx > 0`, e.g. ~24px; `offender` names the spilling element), apply the fix, re-measure,
require `overflowPx === 0`. The trap that bit VCST-5276: `.blade-static` is fixed-height with
`overflow: visible`, so the assertion compares its **content's** real bottom — NOT `blade-static.bottom`, the
fixed-box edge that falsely read "no overlap".

**Step 3 — visual render harness (`visual-render-harness.md`)** for the before/after picture + the ui-grid
relayout caveat. The screenshot is supporting evidence; **the numeric measurement is the gate.** Both go in
the PR body. For a deployed fix, re-measure live (DevTools) post-deploy to close G6 — that is the only check
that proved VCST-5276 either way.

---

## 5. Related

- `/angular-admin` `css-layout-patterns.md` — before/after fix recipes anchored on real blades.
- `/angular-admin` `visual-render-harness.md` — the pre-PR browser proof.
- `vc-module-architecture.md` §2 — Admin UI ships inside the module repo (single-repo fix).
- `.claude/rules/quality-gates.md` — G2/G3/G4/G6 treatment of Admin SPA layout/CSS fixes.
