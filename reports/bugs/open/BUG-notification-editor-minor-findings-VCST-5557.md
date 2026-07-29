# Notification template editor — minor findings, cosmetics and scope drift (grouped)

## Status: CONFIRMED

**JIRA:** VCST-5614 (filed 2026-07-29, linked to VCST-5557 via "Relates")

**Severity:** Low (one Low-Medium) · **Found during:** `/qa-test VCST-5557` · All on PR #202's surface

**Env:** vcst-qa @ Platform 3.1051.0, `VirtoCommerce.Notifications 3.1013.0-pr-202-0b9c`

Grouped deliberately: each item is individually below the bar for its own report, all live in the same two files, and they are cheapest to fix in one pass. The High/Medium defects are filed separately (see *Related* below).

## Findings

| # | Finding | Sev | Evidence / RCA |
|---|---------|-----|----------------|
| 1 | **Every editable template opens with a red JSON parse error.** Sample data is empty on all user-created templates, so the lint gutter shows `Parse error on line 1: … Expecting 'STRING','NUMBER',… got 'EOF'` while the "Invalid JSON" badge (correctly) stays hidden — contradictory signals on the default state of every template. | Low-Med | Confirmed at Layer 4: `GET /api/notifications/{type}` returns `sample: ""` for every non-predefined template (predefined ones carry ~17 KB). Lint should treat empty as neutral. `screenshots/BUG-empty-sample-lint-error.png` |
| 2 | **Closing the blade with ✕ after edits discards silently, with no confirmation** — while switching templates/widgets *does* prompt. Inconsistent guard, and since PR #202 removed the bottom OK/Cancel bar, ✕ is now the only Cancel affordance. | Low | `screenshots/H4-after-close-no-prompt.png`; server data verified unchanged |
| 3 | **After `Ctrl+Z` → `Ctrl+Y` restores byte-identical content, the blade still reports itself modified** and prompts to save. Not reproducible from a plain open — only after the undo/redo round-trip. | Low | Follows from the CodeMirror history baseline issue (see related Ctrl+Z report) |
| 4 | **Full-screen z-index intent is inverted by one.** `body.nt-fullscreen-active article { z-index: 1001 !important }` puts `article` one *above* the overlay's `z-index: 1000`. Harmless today (transparent ancestor, no controls), but hit-testing the bottom ~10 px band (y ≥ 1070, full width) returns `article.cnt`. Intent was above-nav (100) / below-overlay. | Low | `Content/css/styles.css` — `.nt-editor.__fullscreen { z-index: 1000 }` vs the `!important` 1001 |
| 5 | **`POST /api/notification-layouts/search` fires 2–3× per blade open** (observed request triples 133/135/136 and pairs 170+172, 205+206, 209+210). The PR's new `loadLayouts()` existence probe duplicates what `ui-scroll-drop-down` already requests. | Low | `notifications-edit-template.js` → `loadLayouts()` + the template's `data="searchNotificationLayouts(criteria)"` |
| 6 | **`Esc` in full-screen with the autocomplete open closes the dropdown *and* exits full-screen** in one keypress — two state changes for one Escape. | Low | `onFsKeydown` listens on `window` and does not check whether CodeMirror's hint widget consumed the key |
| 7 | **Only the "Invalid" half of the promised Valid/Invalid indicator exists.** The scope lists "a Valid/Invalid indicator"; the badge is `display: none` whenever the JSON parses, so there is no affirmative valid state — which, combined with #1, means the editor never confirms good JSON. | Low | `updateIndicator()` — `indicator.css('display','none')` on successful parse |
| 8 | **The "Hide description" link renders as just "Hide".** | Low | Reuses the platform key `platform.blades.settings-detail.hide-description` |
| 9 | **"Inline styles consolidated into `Content/css/styles.css`" is only partly done, and partly reversed.** The blade template still carries `style="margin:0"` / `style="margin-top:0"`, and the controller now *injects* inline styles at runtime for exactly the chrome this housekeeping item claims to have moved (`container.css({position:'absolute', top:'5px', …})`, `formatBtn.css({backgroundColor:'#43b0e6', …})`, the `#F44336` status indicator). | Low (tech debt) | `notifications-edit-template.tpl.html` + `injectFormatButton()` / `injectHtmlFormatButton()` |
| 10 | **Full-screen button is 3.5 px above the tab centres** (button centre Y 283.7 vs tabs 287.2) — `margin: 0 0 6px auto` fighting `align-self: center`. | Cosmetic | measured |
| 11 | **`.CodeMirror` and `.nt-preview-frame` overflow their pane by 2 px** (`height: 100%` + 1 px borders with a `box-sizing` mismatch): CM border-box 730 in a 728 pane; `.nt-editor` scrollHeight 796 vs clientHeight 794. | Cosmetic | measured |
| 12 | **Field help text renders at 16 px while its own label is 14 px** and inputs are 13 px — the explanation is larger than the thing it explains. | Cosmetic | measured |
| 13 | **An empty template body yields a blank white preview with no empty-state message** (`srcdoc` length 26). | Cosmetic | measured |

## Evidence for item 1 (the most user-visible of the group)

Every editable template opens with this red parse error, because its sample data is empty:

![Empty sample data showing a red JSON parse error on open](../../tickets/Sprint26-15/VCST-5557/screenshots/BUG-empty-sample-lint-error.png)

*Jira: attached as `BUG-empty-sample-lint-error.png` (id 80161).*

## Layer Validation

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | N/A | admin-only surface |
| 2. Backend Admin | **FAIL** (items 2–13) | measurements + screenshots above |
| 3. GraphQL xAPI | N/A | not exercised |
| 4. Platform REST API | **FAIL** (item 1 only) | `sample: ""` on every editable template |

**Owning layer:** Layer 2 for all but item 1 (whose data shape is Layer 4, though it is equally fixable as a client-side "empty is not invalid" guard).

## Explicitly excluded — verified NOT this PR

Found during the same run and deliberately left out: the platform `ui-select` not closing on `Esc`; the raw i18n key `notifications.blades.notification-details.placeholders.notificationType` in the adjacent notification-details blade; `gstatic.com/charts` CORS failures on the platform dashboard; journal entries failing with `'To' must not be empty` (env data, predating the session); the `virtostart-main…` image host `ERR_NAME_NOT_RESOLVED` inside predefined sample data; and the Invoice template body hardcoding an `http://` logo URL (mixed content + broken image — template content, not code).

## Related

`BUG-notification-predefined-template-editable-VCST-5557.md` · `BUG-notification-template-save-not-persisted-VCST-5557.md` · `BUG-notification-editor-ctrl-z-wipes-template-VCST-5557.md` · `BUG-notification-editor-codemirror-fold-addon-missing-VCST-5557.md` · `BUG-notification-email-template-lost-file-upload-VCST-5557.md` · `BUG-notification-preview-500-on-midedit-liquid-VCST-5557.md` · `BUG-notification-editor-keyboard-a11y-VCST-5557.md` · `BUG-notification-editor-format-dialogs-not-localized-VCST-5557.md` · `BUG-notification-fullscreen-hides-invalid-json-message-VCST-5557.md`

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 2 — Admin SPA (module-embedded AngularJS); item 1 also touchable at Layer 4
- **Suggested repo:** `VirtoCommerce/vc-module-notification`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** Notifications — template edit blade + `Content/css/styles.css`
- **RCA anchor:** `src/VirtoCommerce.NotificationsModule.Web/Scripts/blades/notifications-edit-template.js` and `.tpl.html`, `src/VirtoCommerce.NotificationsModule.Web/Content/css/styles.css` (per-item anchors in the table above)
- **Routing confidence:** HIGH for the repo; **LOW as a single fix unit** — this is a grouped cleanup, not one root cause. `/qa-fix` should decline it as a batch and cherry-pick, or a human should fold these into the PR.
