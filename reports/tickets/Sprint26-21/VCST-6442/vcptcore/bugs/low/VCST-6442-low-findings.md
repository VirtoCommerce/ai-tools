# VCST-6442 — Low findings (below the filing floor, not filed) · vcptcore-qa · 2026-10-28

Build: PageBuilderModule 3.1039.0-pr-179-5c9d · Pages 3.1011.0-pr-24-8c93 · XCMS 3.1009.0-pr-28-7ebe

| # | Area | Finding | Expected | Evidence |
|---|---|---|---|---|
| L1 | REST | `POST grouped/permalink-usages` with `null` / `""` body → 500 NullReferenceException | 400 | REG-2026-10-28-1917 traces/CMS-PC-028-FAIL-trace.json |
| L2 | REST | `POST /grouped` and `create-group-page` with `userGroups` as an array → 500 | 400 (field is a comma-separated string) | 4a admin-UI REST probe |
| L3 | REST | `create-group-page` without `content` but with `userGroups` → 500 (400 without userGroups) | 400 | 4a frontend setup |
| L4 | REST | `grouped/archive` with ids in the JSON body → 204, archives nothing (ids only work in the query) | 400 or archive | 4a frontend teardown |
| L5 | Shell | Permalink warning lists names as plain text, no links, no status/language (112272: "links to them") | links to the pages | 4a-adm-a1-warning-on-open.png |
| L6 | Shell | Warning keeps an old page name after another page is renamed (publish error shows the new name) | refreshed list | 4a admin UI |
| L7 | Shell a11y | Focus does not move into the 2nd of two chained confirmations; FocusTrap console warning; focus not returned after cancel | focus in dialog | 4a-adm-both-2nd-dialog.png |
| L8 | Shell | Load content silently ignores a JSON file of an unknown shape (empty "New page" form, no message) | error message | 4a admin UI |
| L9 | Shell i18n/UX | Popup chrome (titles, Confirm/Cancel/OK) English in de/ru; "Show more" untranslated in ru; Confirm low-emphasis vs Cancel primary in a destructive confirm; "Unpublish them" for one page | localized; destructive emphasis | 4v-i18n-*.png, design-report.md |
