# Evidence index — VCST-6077 F-6 (Notes textarea has no accessible name)

**Env:** TEST_ENV=vcst · vcst-qa backend (shared) · NEW = `http://localhost`, theme `2.59.0-pr-2536-c2de-c2de2cd2` · BASELINE = deployed storefront, footer `Ver. 2.59.0.` · Edge 1920 · sales rep `@td(SR_REP_PRIMARY.email)` · 2026-10-07
**Trace ID:** n/a. Client-only markup defect.

| Slot | NEW (New task modal, /company/tasks) | BASELINE (Edit task modal, /company/calendar) |
|---|---|---|
| Screenshot | screenshots/new-new-task-notes.png | screenshots/baseline-edit-task-notes.png |
| Label element | `<div for="textarea-1305" class="vc-label">Notes</div>` | `<div for="textarea-1734" class="vc-label">Notes</div>` |
| textarea attributes | id=textarea-1305, aria-labelledby=textarea-1305 (itself), no aria-label, `labels` empty | id=textarea-1734, aria-labelledby=textarea-1734 (itself), no aria-label, `labels` empty |
| Accessibility snapshot | unnamed `textbox`; Playwright resolved it as `getByLabel('', { exact: true })` | unnamed `textbox` |
| Sibling fields (control) | Title, Due date, Priority and Type each have a `<label for>` | same |

Source: vc-frontend `dev` `client-app/ui-kit/components/molecules/textarea/vc-textarea.vue` L14 `<VcLabel :for="componentId">` and L30 `:aria-labelledby="componentId"`. `vc-label.vue` renders a `<label>` only when its `forId` prop is set (`:is="forId ? 'label' : 'div'"`). The file is not in the PR #2536 file list.
