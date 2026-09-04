# VCST-5668 — Fix Verification

**Ticket:** VCST-5668 · Bug · Medium · `[vc-shell] Sidebar menu toggle aria-label is hardcoded English`
**Fix task:** VM-1749 (Done) · **Fix:** vc-shell PR [#297](https://github.com/VirtoCommerce/vc-shell/pull/297) (`9e2abc2de`), merged 2026-08-13
**Verdict: VERIFIED WITH NOTES** — 2026-08-25

## Env

**`@vc-shell/framework`** / Marketplace Vendor Portal (separate product — not the storefront, not the Platform
Admin SPA). Affected 2.4.0, fixed **2.5.0**. Verified against `main @ 324cd9b09` (= v2.5.0) and live on the
deployed vcmp-dev vendor-portal, whose console banner reported
`@vc-shell/framework v2.5.0 · 2026-08-19T10:23:58Z · 2964ccbe3`.

## Summary

The burger toggle's `aria-label` now goes through vue-i18n and **demonstrably resolves at runtime** —
`Open menu` / `Close menu`, both states, no raw keys. All three ACs are met at source; the *English* half of
AC1 is confirmed live. The **German** half could not be exercised: the deployed Vendor Portal registers
English as its only selectable locale (Note 1). Separately, the sweep the ticket itself invited shows this
was **not** the last hardcoded `aria-label` — 13 more sites remain (Note 2).

## The change

```diff
- :aria-label="isMenuOpen ? 'Close menu' : 'Open menu'"
+ :aria-label="isMenuOpen ? $t('COMPONENTS.ORGANISMS.VC_APP.CLOSE_MENU')
+                         : $t('COMPONENTS.ORGANISMS.VC_APP.OPEN_MENU')"
```

The ticket offered two options — reuse the existing `VC_BLADE.CLOSE_MENU`, or add a dedicated pair under
`VC_APP`. The dev took the second, which is the better of the two the ticket proposed: a blade-scoped key
reads wrong on an app-level control. Four files, 23 insertions, 1 deletion.

## RED → GREEN (unit)

Scope `ui/components/organisms/vc-app`, run from `framework/` (the CI cwd):

| Phase | Source | Result |
|---|---|---|
| **GREEN** | `main @ 324cd9b09` | **210 passed (210)** |
| **RED** | `SidebarHeader.vue` reverted to the parent of `9e2abc2de`; its two added tests unchanged | **2 failed / 208 passed** |

The RED failure is `expected 'Open menu' to be 'COMPONENTS.ORGANISMS.VC_APP.OPEN_MENU'`. The test stubs `$t`
to return the key, so a raw English string is precisely what fails — the test cannot pass by accident, and it
detects exactly this defect. Evidence: `evidence/green-fixed.txt`, `evidence/red-prefix.txt`.

## Acceptance criteria

| AC | Verdict | Basis |
|---|---|---|
| Both states of the toggle announce a localized string **in en and de** | **PARTIAL** — en confirmed live, de not exercisable | See below + Note 1 |
| `yarn check:locales` passes | **PASS** | exit 0, *"All localizations are in sync with en.json!"* |
| No remaining hardcoded English `aria-label` in `SidebarHeader.vue` | **PASS** | both labels in the file are `$t(...)` calls (`:38` notifications, `:76` the burger) |

**AC1, source side.** `en.json` and `de.json` are the only two locales; both carry both keys, with correct
German — `OPEN_MENU` = `Menü öffnen`, `CLOSE_MENU` = `Menü schließen`.

**AC1, deployed side.** The served `vc-shell-framework22260.js` contains `Menü öffnen` ×1, `Menü schließen`
×2, `Open menu` ×1, `Close menu` ×2. That asymmetry corroborates the key topology exactly: `CLOSE_MENU`
already existed under `VC_BLADE` and was added under `VC_APP` (2 entries), while `OPEN_MENU` is new and so
appears once — matching the ticket's own note that no `OPEN_MENU` key existed.

**AC1, runtime (the part the unit tests cannot reach).** Read off `.sidebar-header__menu-button` on the
deployed build:

| State | `aria-label` (verbatim) | `aria-expanded` |
|---|---|---|
| Menu closed (initial) | `Open menu` | `false` |
| Menu open (after one real click) | `Close menu` | `true` |

No raw key appeared in either state, the accessibility tree corroborated the attribute read
(`button "Open menu"`), and a second click returned it cleanly. **Control check:** the neighbouring
notification bell reads `Notifications` — also resolved, not a key. So i18n works generally *and*
specifically here; there is no burger-specific i18n failure.

**Render conditions** (derived from source, then confirmed live): desktop layout only, sidebar expanded
(pinned or hovered), and not embedded — `.sidebar-header__toolbar` is `v-if="expanded && !isMobile"` and the
burger additionally needs `showBurger`. At 600×900 the header switches to the mobile variant and **neither
the burger nor the bell exists in the DOM**.

Screenshots (all verified on disk): `screenshots/c1-en-closed-open-menu.png`,
`c1-en-open-close-menu.png`, `c2-user-menu-language-switcher.png`, `c2-language-dropdown-expanded.png`.
No vue-i18n missing-key or fallback warnings at any point.

## Notes

**1. The German half of AC1 is not closable on this environment — reported BLOCKED, not passed.** A locale
switcher *does* exist (user menu → `Language`), and it was opened as a real user. It contains **exactly one
option: `English`**, marked active. `localStorage` holds `VC_LANGUAGE_SETTINGS=en`. The framework ships the
`de` strings — proven in the bundle above — but the **selectable-locale list is registered by the
`vendor-portal` app, not the framework**, and on vcmp-dev it registers English only. There is therefore no
legitimate user-facing route to German: an unregistered locale is not selectable, so browser-language
negotiation cannot reach it either. Forcing it via `localStorage` or app state was deliberately **not** done
— that would prove nothing about the shipped switcher.

Nothing observed suggests German would behave differently: it is the same `$t()` call, the keys exist in
`de.json`, and `check:locales` is green. But it is unproven at runtime and is not being counted as passed.
Closing it needs either a deployed env whose app registers `de`, or a Storybook/framework-level check where
the framework's own locale set is reachable.

**Worth raising beyond this ticket:** if no deployed environment offers a second locale, then *every*
localization AC in this product is unverifiable at runtime and the shipped German translations are
effectively untested. That is a process question for the team, not a defect in this fix.

**2. The sweep the ticket invited — this was NOT the last hardcoded `aria-label`.** The ticket's closing
note asked for exactly this and flagged that it hadn't been done systematically. Done: 229 `.vue` files, 136
`aria-label` bindings across `framework/ui` + `framework/shell`, excluding tests and stories.

**Method caveat that matters.** My first detector came back clean and I nearly reported "this was the last
one". Validating it against the pre-fix tree showed it **failed to catch the very defect this ticket
describes** — the original is a *ternary* of quoted literals, which a `:aria-label="'` pattern cannot match.
The rewritten detector (parse the binding incl. multi-line, strip `$t()`/`t()` calls, flag surviving prose
literals) scores **16 findings pre-fix → 15 post-fix, delta exactly `SidebarHeader.vue`**. Only with that
validation is a result trustworthy.

13 further code sites in 12 components still hold hardcoded English `aria-label`s:

| Component | Literal(s) |
|---|---|
| `vc-badge.vue:23`, `:68` | `'Notification'` |
| `vc-banner.vue:13` | `'Error'` / `'Warning'` / `'Information'` |
| `vc-environment-banner.vue:5` | `` `Environment indicator: ${name}` `` |
| `vc-status-icon.vue:5` | `'Active'` / `'Inactive'` |
| `vc-color-input.vue:83` | `` `Pick color…` `` |
| `vc-editor.vue:85` | `'Exit fullscreen'` / `'Fullscreen'` |
| `vc-file-upload.vue:27` | `'Upload files'` |
| `vc-rating.vue:36` | `` `Rating: ${modelValue} out of ${max}` `` / `'No rating'` |
| `vc-select/_internal/SelectTrigger.vue:91` | `` `Remove ${…}` `` |
| `vc-slider.vue:16` | `'Content carousel'` |
| `vc-data-table/components/DataTableCellRenderer.vue:26` | `'Collapse row'` / `'Expand row'` |
| `vc-data-table/components/TableGroupRow.vue:22` | `'Collapse group'` / `'Expand group'` |

**Four are the identical shape to the defect just fixed** — a ternary of two English strings:
`vc-status-icon`, `vc-editor`, `DataTableCellRenderer`, `TableGroupRow`.

Two sweep hits are **false positives**, excluded from the count: `vc-input.vue:200` (the leftover
`'password'` is a comparison operand; both branches are `$t(...)`) and `SchedulerMonthView.vue:54` (the
leftover `'p'` is a date-format token; the template interpolates data only).

This does not fail VCST-5668 — its scope was explicitly this one file and all three of its ACs are met. It
is the follow-up the ticket itself asked for.

## Incidental — nothing filed

Three 404s on **other apps'** logo assets, fired when the App Hub popover opened:
`/apps/app_search/logo.svg`, `/apps/builderio/logo.svg`,
`/apps/page-builder-shell/assets/images/logo-only.svg`. Pre-existing, unrelated to this fix.

## Coverage limits

The **collapsed-sidebar-hover** variant of the render condition (burger appears on hover while unpinned) is
source-derived only — it was not exercised live, to avoid persisting a sidebar-state change. The mobile-width
negative case *was* verified live.

## Storefront rules deliberately NOT applied

vc-shell is a separate product: `BL-UI-*`, `critical-ui-scope.md`, `storefront-selectors.md` and the 123
regression suites cover the storefront only — none cover vc-shell or the Vendor Portal. Substituted: the
framework's own vitest suites, `check:locales`, live attribute + accessibility-tree reads on the deployed
artifact, and a validated source-wide sweep.

**Data changes: none.** Locale unchanged (no `de` option to select), burger returned to its initial state,
viewport restored, no entity created or edited.
