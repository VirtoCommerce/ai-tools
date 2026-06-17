# CSS / layout fix recipes — Admin SPA blades

Before/after recipes for the layout/CSS bugs that show up most in module blades. The class vocabulary,
canonical reference blades, and discovery recipe live in
`admin-spa-ui-conventions.md` (this skill) — **read that first**. This file is the fix-time
cookbook: recognize the symptom → apply the platform pattern → prove it with the render harness.

**Golden rule (both iron rules from the conventions doc):** never add inline `position:absolute|fixed`,
fixed-px `width/height/left/top`, or `ng-style="{'height':'…px'}"`; mirror a canonical sibling blade instead
of inventing layout. Adding inline layout to a blade is a Gate-4 reject.

---

## Recipe 1 — Toolbar overlaps / misaligns (the PR #101 class of bug)

**Symptom:** filter/search controls overlap the grid header, or sit at wrong offsets — usually because the
toolbar was built with absolute positioning + fixed pixels.

```html
<!-- BEFORE (broken): absolute positioning + fixed px + reserved height -->
<div class="blade-static" ng-style="blade.warn && {'height':'140px'}">
  <div class="form-group">
    <input style="width:190px">
    <button class="btn __other" style="position:relative;right:45px"></button>
    <ui-select style="left:220px;position:absolute;width:190px;top:0px"></ui-select>
    <a style="left:416px;position:absolute"><i class="fa fa-pencil"></i></a>
  </div>
</div>

<!-- AFTER (fixed): searchrow flex + column-half + filter-edit; let blade-static auto-size -->
<div class="blade-static">
  <div class="form-group searchrow">
    <div class="form-input __search column-half">
      <input placeholder="{{ 'platform.placeholders.search-keyword' | translate }}" ng-model="filter.keyword">
      <button class="btn __other" title="Clear" ng-click="filter.keyword=null"><i class="btn-ico fa fa-remove"></i></button>
    </div>
    <ui-select class="column-half" ng-model="filter.current" ng-change="filter.change()">
      <ui-select-match placeholder="…">{{$select.selected.name | translate}}</ui-select-match>
      <ui-select-choices repeat="x in filters | filter: $select.search">
        <span ng-bind-html="x.name | translate | highlight: $select.search"></span>
      </ui-select-choices>
    </ui-select>
    <a href="" class="filter-edit" ng-click="filter.edit()"><i class="fa fa-pencil"></i></a>
  </div>
</div>
```

Canonical reference to mirror: `vc-module-pricing/.../Scripts/blades/assignment-list.tpl.html`.

---

## Recipe 2 — Blade clips content / fixed height

**Symptom:** content cut off or a gap below a toolbar because a `blade-static` height was hardcoded.

```html
<!-- BEFORE -->  <div class="blade-static" ng-style="{'height':'140px'}"> … </div>
<!-- AFTER  -->  <div class="blade-static"> … </div>      <!-- auto-sizes -->
```

If an optional row (e.g. a warning) caused the height reservation, gate the row with `ng-if` instead of
reserving fixed height:

```html
<div class="blade-static">
  <div class="form-group searchrow"> … </div>
</div>
<div class="inner-block" ng-if="blade.warn">{{ 'module.warnings.x' | translate }}</div>
```

---

## Recipe 3 — Two/three-column layout via inline width

**Symptom:** side-by-side fields sized with `style="width:…"` / floats.

```html
<!-- BEFORE --> <div style="float:left;width:48%"> … </div><div style="float:left;width:48%"> … </div>
<!-- AFTER  --> <div class="form-group searchrow">
                  <div class="form-input column-half"> … </div>
                  <div class="form-input column-half"> … </div>
                </div>
```

Use `column-half` / `column-third` / `column` inside `searchrow`. For a wider blade, add a `blade-content`
size modifier (`__medium-wide` / `__large-wide` / `__xlarge-wide`) — don't widen children with pixels.

---

## Recipe 4 — Button styling / invented modifiers

**Symptom:** a primary button styled with inline CSS or a non-existent `btn __save` / `btn __add`.

```html
<!-- BEFORE --> <button style="background:#43B0E6;color:#fff">Save</button>
<!-- BEFORE --> <button class="btn __save">Save</button>          <!-- __save doesn't exist -->
<!-- AFTER  --> <button class="btn" ng-disabled="formScope.$invalid"><span>{{ 'platform.commands.save' | translate }}</span></button>
<!-- secondary --> <button class="btn __cancel"><span>{{ 'platform.commands.cancel' | translate }}</span></button>
<!-- icon      --> <button class="btn __other"><i class="btn-ico fa fa-remove"></i></button>
```

Real modifiers only: `__cancel`, `__other`, `__loading`. Primary = plain `btn`. Disable via `ng-disabled`.

---

## Recipe 5 — Raw `<table>` or unstyled checkbox

```html
<!-- BEFORE --> <table> … </table>
<!-- AFTER  --> <div class="table-wrapper"><div ui-grid="gridOptions" ui-grid-auto-resize ui-grid-selection></div></div>
<!--            + <div class="note" ng-if="!rows.length">{{ 'platform.list.no-data' | translate }}</div> -->

<!-- BEFORE --> <input type="checkbox" ng-model="x">
<!-- AFTER  --> <div class="vc-checkbox">
                  <input class="vc-checkbox__input" type="checkbox" id="x" ng-model="x">
                  <label class="vc-checkbox__label" for="x">{{ 'module.fields.x' | translate }}</label>
                </div>
```

(Match the file's existing checkbox style if it uses the legacy `form-control __checkbox` — don't mix.)

---

## After applying any recipe

1. **Self-audit the diff** for inline `position` / fixed px / `ng-style` height — remove all of them.
2. **Prove it** with `visual-render-harness.md`: scaffold `render.html`, hand to `qa-backend-expert` for the
   red (HEAD) vs green (fixed) screenshots **before** the PR opens. Paste both into the PR body.
3. Keep the diff **minimal** — only the markup that fixes the bug; no restyle/modernize of the rest of the blade.
