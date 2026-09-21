# VCST-4933 — consolidated findings (5a triage)

Run 2026-09-17 · env **vcptcore-qa** · FULL path · PageBuilderModule `3.1025.0-pr-159-7361` (PR #159)
+ storefront `2.58.0-pr-2410-3aa8` (PR #2410). Both PRs deployed; the change IS live on this env.

Operator rulings carried into triage: test all 8 ACs and FLAG (not auto-fail) anything plausibly owned
by sub-tasks VCST-5184 / VCST-5185; the silent-lost-update behaviour is filed as its OWN Medium bug,
separately from the AC8 verdict.

## A. Prior findings on the ticket — disposition

| Prior | Source | Disposition |
|---|---|---|
| (3) "Paste section" enabled without validating the clipboard | 2026-08-19 | **REFUTED at code level.** `["paste-section", !await this.hasClipboardData()]`; `getData()` validates shape and stamps `wrongData:true`. The control is DISABLED for an invalid clipboard. UI confirmation still owed. |
| (4) false "Select only independent sections to create a Shared Component" | 2026-08-19 | **NOT REPRODUCIBLE — the string does not exist in the shipped bundle** (all 11 chunks + main grepped). It came from a different build or the platform toast layer. Needs confirming with the original reporter. |
| (5) usage counter says "1 page", excludes the original/master | 2026-08-19 | **DOES NOT REPRODUCE.** `usageCount` reconciled against ground truth across all 107 pages: 3/3, 2/2, 1/1 exact, master INCLUDED. Residual is a PO/UX question (should the master be LABELLED distinctly?), not a defect. |
| (6) empty panel after Detach | 2026-08-19 | **DOES NOT REPRODUCE.** Panel immediately shows `Edit current section / Type: Title / ID: title9O3Jjqhp`, fields populated and editable, toast "Shared Component detached. This copy is now independent." No re-select needed. |
| (1) and (7) | 2026-08-19 | **UNRECOVERABLE — screenshot-only/empty, and all 16 attachments are unfetchable (expired Jira token).** STATED GAP. |
| "Shared Component isn't displayed in Preview" | 2026-09-11 | **CLOSED.** On valid fixtures the component renders completely in the Designer preview — three trio sections inline in document order, one green boundary, badge `Shared · Used on 3 pages`. The blank render was entirely the `"Text"`-capitalisation fixture defect. |

## B. Verified PASSES — the load-bearing ones

| AC / area | Result | Grounding |
|---|---|---|
| **AC7** expansion + API isolation | **PASS, all three clauses** | compact 3-key marker in authoring; delivered doc has ZERO `componentRef`; full network trace shows zero storefront calls to the component API (zero platform-API calls at all) |
| **AC4** identification + warning | **PASS** | verbatim: badge `Shared · 3`, `title="Used on 3 page(s)"`, boundary `Shared · Used on 3 pages`, info box `This is a Shared Component`, warning **`Editing will update all 3 pages using it.`**, `Edit original` / `Detach`, `WHERE USED` list |
| **AC2** linked vs independent copy | **PASS** | linked placement is the exact 3-key marker; independent copy is an ordinary `type:"text"` section with id regenerated `text01`→`textwnDM1jGp`, usage unchanged; edits to the original do NOT touch the copy |
| **AC5** detach | **PASS** | fresh ids, content frozen — original reverted afterwards and the detached copy did not follow |
| **AC6** usage + deletion guard | **PASS** | delete with usage>0 → **409 naming the affected pages**; drive to 0 → **204**; repeat → 404. UI half: Delete disabled with the page named and clickable |
| **AC8** permissions half | **PASS** | clean role×verb diagonal across 7 roles; every refusal a real 403, never 200-with-empty-data, never 404-hiding; cross-store linked ref → 400; store move → 400; `/{id}/content` gated identically on GET and the undocumented PUT/POST |
| **AC8** consistency half | **PASS** | 11 concurrent rounds incl. 6 simultaneous writers — `contentWinners == contentRefs == indexRefs` every time, **0 torn states**; 6 rounds of DELETE-vs-save race, **0 dangling references** |
| **AC1** library panel | **PASS** | `SHARED BLOCKS LIBRARY` is the first group, collapsible, per-row usage counts; 15 ordinary blocks below; search filters both with correct empty states |
| Asset references | **PASS** | transitive attribution works (a page that only LINKS the component is named in the asset's refs); `referencesCount == pageRefs + scRefs` holds everywhere; no stale duplicates after swap/remove |

## C. Findings to file

| # | Finding | Severity | Provenance | Note |
|---|---|---|---|---|
| F1 | **Silent lost update.** No `ETag`/`Last-Modified`/`rowVersion`/version parameter anywhere; two authors saving the same page both get 204 and one's work is gone with no conflict, no warning, and no way for the client to detect it. | **Medium** | IN-SCOPE | Operator ruling: filed SEPARATELY from the AC8 verdict. AC8's "atomicity" literally holds — one whole version wins — so this is a distinct defect graded on consequence, not on whether an AC named it. |
| F2 | **`POST /shared-components` accepts a non-existent `storeId`** → 201 Created; the orphan is queryable via search on the fake store, invisible from every real library, unreachable from any page, undeletable via UI. | **Medium** | IN-SCOPE | Inconsistent with the two OTHER store guards in the same controller, both present and correct (cross-store link 400, store move 400). Create is the one hole. Plausibly VCST-5184 — FLAGGED. |
| F3 | **Designer section tree is completely unreachable by `Tab`** — keyboard walk goes from toolbar straight into the canvas iframe, skipping the tree and every `tune`/`drag_indicator`/`add_circle` control. | **High** | **PRE-EXISTING (reasoned, not yet A/B-proven)** | `BL-UI-007` `[P1-data]` — matches its own Violation signal. Per its Scope clause it judges what a surface OWNS; the tree predates Shared Components, so provenance is pre-existing and the NEW placement row inherits it. a11y-on-a-functional-ticket ⇒ **standalone + related, does NOT fail 5c**. Proving pre-existing properly needs an A/B on a pre-#159 build. |
| F4 | **Clipboard read gates the whole actions menu.** Both action-list builders open with `await hasClipboardData()` → `navigator.clipboard.readText()`, with no timeout and no fallback. Without the permission the promise never settles and the menu renders empty — silently, zero console errors. | **Medium** | IN-SCOPE | CONFIRMED by operator in desktop Chrome: with the permission granted the menu opens. **Cross-browser consequence: Firefox does not implement `readText()` for web content at all, so the menu — and therefore AC3's entry point — is permanently unreachable there.** |
| F5 | `add_circle` insert affordance intercepts pointer events over the adjacent section row's centre; the row is reachable only via its left icon or right edge. | **Medium** | IN-SCOPE | Adjacent to `BL-UI-003` |
| F6 | `aria-label` on a bare `<span>` with no role for the Shared badge (axe `aria-prohibited-attr`, serious); tree `title` attributes contain literal `"(undefined)"` from broken interpolation — invisible in UI, exposed to AT. | **Medium** | IN-SCOPE | a11y ⇒ standalone + related |
| F7 | At 375 px a floating Refresh FAB overlaps the details blade's Rename button by ~102×34 px. `Escape` closes neither the details blade nor the Add-block panel. | **Medium** | IN-SCOPE | `BL-UI-004` (measured by bounding box) |

## D. Below the severity floor — NOT filed, named in the tracker comment

- VC Shell bare URL is a dead end: `/apps/page-builder-shell/` authenticates then shows "Store context is missing" on every blade with **no store picker and no way forward**; `?storeId=<store>` fixes it and the product's own generated links carry the param. (Likely VCST-5185.)
- 403-vs-404 discrimination: a foreign-store id returns 403 while a nonexistent id returns 404, letting an authenticated back-office user distinguish "exists elsewhere" from "does not exist".
- `PUT /{id}` echoes a stale `modifiedDate` in its response while a follow-up GET shows the committed one.
- Refusal bodies inconsistent (`{}` vs empty), not aligned to refusal kind.
- Plural copy renders one fact five ways, incl. the non-localizable `Used on 3 page(s)`.
- Archive-confirm dialog inverts the primary affordance (Cancel filled, Confirm a text link).
- Insert dialog says `Copy component:` / `Paste component` for what is an insert.
- `DELETE /grouped/{id}` returns `{"pageDeleted":false}` although the page IS deleted.

## E. Verified and deliberately NOT filed (checked against by-design rules)

- Blank storefront render on `AGENT-TEST-q5-*` pages — **fixture defect**, proven by A/B control: a page with no shared component is equally blank, `/qa-homepage-spring-sale` renders fully. Root cause: block type `"Text"` capitalised, no renderer.
- `type:"ComponentRef"` (case variant) → 204, stored as an ordinary block, usage NOT incremented. Matching is exactly `type == "componentRef"`; key-count==3 is a completeness check AFTER matching (4 keys with the right type → 400).
- XSS name `<script>alert(1)</script>` stored raw by the API but **rendered escaped** as literal text. No execution.
- Duplicate component names allowed; no uniqueness stated anywhere.
- `usagePages: []` from search — by design (`includePages:false`); the UI issues its own `GET /{id}`, so no AC6 defect.
- `usageCount` counts **distinct pages, not placements**, and a **Draft** page counts toward usage.
- `/versions`, `/history`, `/usage`, `/sections` 404 — corroborated by swagger; those routes do not exist.

## F. Contract notes for whoever writes the regression cases

1. **`usageCount` counts references in BOTH the published and the draft version of a page.** Detach+Save updates only the draft, so a page whose PUBLISHED snapshot still holds the marker stays counted until re-publish. Reconciling usage against draft content alone yields a phantom stale reference.
2. **Designer save rewrites a text block's `text` from a string to `{markdown, html}`.** REST-seeded content uses the string form. Any assertion or seeder comparing that field by shape breaks depending on which path last wrote it.
3. The marker must be a TOP-LEVEL item with EXACTLY 3 keys. Building negatives with any other shape makes every one return 204, which reads as "the whole validation layer is missing".

## G. Stated gaps

1. **AC3 (create from page selection + both rejection paths) — NOT VERIFIED.** 8 checklist items BLOCKED by F4. Config patched with `clipboard-read`/`clipboard-write`; awaiting an MCP restart to re-run.
2. All 16 ticket attachments unfetchable (expired Jira token) ⇒ prior findings (1) and (7) unrecoverable, and the `vs. DESIGN` axis is SKIPPED, never PASS.
3. VirtoOZ and Context7 both unavailable (OAuth, non-interactive) — no docs grounding.
4. Export/import unverifiable here: `POST /api/platform/export` 500s for ANY module manifest (a platform BackupRestore defect, unrelated to this ticket).
5. **No `BL-*` invariant family exists for Page Builder / CMS** — `bl:extract:list` shows 16 domains, none CMS; `domain:check` DOMAIN-005 fails for the same reason. Every verdict here is grounded in {SPEC}/{OBSERVED}, never {BL}. Four candidate invariants are proposed in the Test Model.
