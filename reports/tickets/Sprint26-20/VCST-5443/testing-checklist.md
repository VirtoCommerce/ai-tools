# VCST-5443 — Testing checklist

**Ticket:** Page Builder Designer: multi-select and folder creation in the Asset Library picker (Task, Medium)
**Verdict: FAIL** (AC1/AC2 not met; operator decision 2026-10-09) · BUG-2 Medium · BUG-1 Low
**Flow / path:** feature-test · FAST · shape class: none · layer: `admin-spa` (module-embedded Angular Designer)
**Env:** vcptcore_qa1 · PageBuilderModule `3.1033.0-pr-166-60e2` (PR #166 head `60e271c`, pinned via vc-deploy-dev#6842, verified LIVE) · Platform 3.1076.0
**Entry:** Admin → Stores → `B2B-store` → Page Builder widget → page (Draft) → Designer. Content/Pages CMS grid is a different entity — never use it.
**Oracles:** ticket AC 1–8 `{SPEC}` · Admin Asset Library workspace = parity oracle for AC6 · BL-UI-001…007 · ECL 7.2/7.3. **No `BL-*` invariant exists for Page Builder** (gap).
**Test data:** live-discover; anything created carries the `AGENT-TEST-5443` prefix (folders lowercase: `agent-test-5443-…`) and is deleted in cleanup. No seeded fixtures needed (`data_surface: false`).
**Not covered here:** Storefront rendering of a gallery (out of the ticket's scope, per the dev comment). No authored regression cases (FAST).

| # | Condition | Source | Verdict | Evidence |
|---|---|---|---|---|
| A1 | Multi-image control (Images / gallery / carousel block) → picker allows checking several assets across one pass; Select shows the count and applies ALL | AC1, AC2 | **FAIL** | no control passes multiple:true (all theme images controls multiple:false); picker opens single-mode only; operator confirmed by hand: multi-select works in Assets, not in Designer |
| A2 | Applied set persists: Save → reload Designer → all N images still in the control, in the selected order | AC2 | **FAIL** | follows A1 |
| A3 | Selection across folders: pick in folder X, navigate to Y, pick more → set is kept | AC1 | **FAIL** | follows A1 |
| A4 | Single-value Image control → only one asset selectable (choosing a second replaces the first); Select applies a scalar; double-click selects | AC3 | PASS | second click replaces first; Save stores scalar — a4-*.png |
| A5 | Cancel / close (✕, Esc) discards the selection and leaves the control unchanged | AC1 | PASS | Esc / Cancel / ✕ keep the previous value |
| A6 | Files/file-list control, if the theme offers one (dev: none on test theme) — otherwise state NOT AVAILABLE | AC2 | NOT AVAILABLE | no files control in the theme |
| B1 | **New folder** button is in the picker toolbar next to **Upload** | AC4 | PASS | b1-picker-toolbar-new-folder.png |
| B2 | Creating a folder sends `POST /api/assets/folder` (existing endpoint, 2xx), no other new endpoint | AC5 | PASS | one POST /api/assets/folder → 204 |
| B3 | Name validation is identical to the Admin workspace: test the same set in both — valid `abc`, `my folder`, `a-b`; invalid `Abc`, `ab`, 64 chars, `-ab`, `ab-`, `a--b`, `a_b`, `ü`, whitespace-only; 63 chars valid. Inline error, no request on invalid | AC6 | PASS | 15 names: Designer = Admin = server, identical messages |
| B4 | Duplicate name (existing folder) → inline/server error, dialog stays, retry possible | AC6, ECL-7.2 | PASS (parity) | duplicate → 204, opens the existing folder, no error — same in Admin (server idempotent, pre-existing) |
| B5 | After create: picker navigates into the new folder; breadcrumb shows it; search cleared | AC7 | PASS | b5-after-create-breadcrumb.png |
| B6 | Upload right after create lands in the new folder (check by the asset URL / Admin workspace) | AC7 | PASS | upload POST 200 into the new folder |
| B7 | Create does not close the dialog and keeps a pending multi-selection (pick 2 → New folder → create → Select (N) still shows and applies them) | AC8 | BLOCKED | dialog stays open ✓; pending multi-selection unreachable (A1) |
| B8 | Enter submits; double-click / repeated submit creates ONE folder; Cancel on the form discards the draft | dev comment, ECL-7.3 | PASS | one POST on double submit; Enter submits; Cancel discards |
| B9 | Created folder is visible in the Admin Asset Library workspace and platform Asset management | AC5 | PASS | b9-*.png |
| S1 | Security fix: a folder whose path contains a `{{=(globalThis.__x5443='ran','x')}}` segment (created via `POST /api/assets/folder` `parentUrl`) — opening it in the picker and creating a subfolder must NOT set `window.__x5443`; the request carries the literal path. Same for a `{{draft}}` segment (folder created in the right place) | review comment 111005 / fix 5c93abf | PASS | {{=…}} / {{draft}} sent literally, nothing executes — s1-*.png |
| U1 | Toolbar layout: New folder/Upload/search/counter aligned, no overflow at 1920 and 390 px; New folder form does not shift the grid | BL-UI-001/003/004/005 | PASS + Low | inline error shifts grid 32 px (BUG-1, Low) — b3-new-folder-inline-error-Abc.png |
| U2 | Keyboard: Tab reaches New folder, input, Create/Cancel; focus moves to the input on open; Esc closes the form | BL-UI-007 | PASS | focus to input, Tab order, Esc closes form |
| R1 | No regression: single-select picker basics (open, browse, search, upload, select) per CMS-139…143 still work | 060b | PASS | open/browse/search/upload/select |
| R2a | Non-admin WITHOUT `platform:asset:create`: New folder and Upload hidden; select + apply + Save existing assets works | PR #166 `canCreateAssets` | **FAIL** | New folder hidden ✓, **Upload shown → 403** (BUG Medium); select/apply/Save ✓ — `r2-a-*.png` |
| R2b | Non-admin WITH `platform:asset:create`: both buttons shown and work | PR #166 | PASS | folder 204, upload 200 — `r2-b-*.png` |
| X | Console: no new errors; network: no 4xx/5xx except the expected validation/duplicate responses | always-on | PASS | no new console errors; no unexpected 4xx/5xx |

## Suggestions for the developer (manual review, 2026-10-06)

- **New folder form: rename the visible label "Cancel new folder" → "Cancel".** The form's buttons are a pair, Cancel/Create, and the longer label reads as a third action and pushes the row width. Keep the distinguishing accessible name (`aria-label="Cancel new folder"`), because the dialog footer has its own **Cancel** that closes the whole picker, and two identically named buttons on one screen are ambiguous to a screen reader (BL-UI-007). Evidence: `screenshots/manual-new-folder-cancel-label.png` (operator, 2026-10-09).

`PENDING-A`: none (FAST authors no cases). C1: skipped — no authored, REPAIR or RE-BASE cases (`--coverage` not passed).

---

## Round 2 — 2026-10-23 · retest of PR #166 head `e2d395ea` (fix commit `27668d0d`)

**Build:** PageBuilderModule `3.1036.0-pr-166-e2d3` pinned on vcptcore-qa1 via vc-deploy-dev#6977 (round 1's pin had been reverted; qa1 ran release 3.1035.0, which does not contain the PR). **Path:** FAST, one execution agent (`qa-backend-expert`, `playwright-edge`). Ticket already in Testing, so no opening hop.
**What changed since round 1:** `27668d0d` — `canUpload()` treats a denied init check (`null`) as denied, so a config without the flag still uploads (BUG-2); the New folder error shares the action row, which reserves two lines (BUG-1). `e2d395ea` merges `dev` (7 commits), so the round-1 PASS set is re-run as regression.
**AC1/AC2 status before the run:** every `images` control in vc-frontend `builder-preview/schemas/sections/*.json` is still `multiple: false` on both `dev` and `master` (checked 2026-10-23). The PR did not change this, and there is no reply to the round-1 question about which block gets `multiple: true`.

| # | Condition | Source | Verdict | Evidence |
|---|---|---|---|---|
| R2a′ | User **without** `platform:asset:create`: picker shows **neither** New folder **nor** Upload; dragging a file onto the grid gives no drop target or copy affordance and does not navigate the browser to the file; selecting, applying and saving an existing asset works | BUG-2 retest · PR body | PASS | only Search in the toolbar; real drop → no request, no navigation; select/apply/Save works — r2b-a-noasset-toolbar.png, r2b-a-noasset-after-drop.png |
| R2b′ | User **with** `platform:asset:create` (non-admin): both buttons are shown; folder → 204; upload → 200 into that folder | BUG-2 fix must not over-deny | PASS | both buttons; folder 204, upload 200 into it — r2b-b-asset-user-*.png |
| R2c′ | Admin: both buttons shown and working | regression of the fix | PASS | both buttons; folder 204, upload 200 |
| U1′ | New folder invalid name (`Abc`, then the longest message: 64 chars): asset grid `top` delta is **0** before vs after the error; the error stays inside the row (wraps, no clipping, no overlap with Cancel/Create) at 1920 px and 390 px | BUG-1 retest · BL-UI-003/004/005 | **FAIL < ~700 px** · PASS ≥ 768 px | grid shift 0 at 1920/1280/1024/768; +11 px at 640, +28 px at 560, +658/+553 px at 390 (message squeezed to 21 px, breaks per character, buttons pushed below the fold) — r2b-u1-error-Abc-1920.png, r2b-u1-error-Abc-390.png (Low, introduced by 27668d0d) |
| A1′ | Is any control in the deployed theme reachable with multi-select? Probe the Designer's block list for any images/files control that opens the picker in multiple mode; if none exists, AC1/AC2 stay **not met / not reachable** | AC1, AC2 | **FAIL — not reachable** | Image, CTA with Image, Features column, Slider slide: all single-mode — r2b-a1-*.png; AC1/AC2 not met |
| A4′ | Single Image control: one selection, a second click replaces it, double-click selects, Save stores a scalar | AC3 | PASS | second click replaces; Save stores scalar; double-click selects only (dialog stays, Select needed) — same as round 1 |
| B1′–B9′ | New folder next to Upload; one `POST /api/assets/folder` (204); validation parity on `abc`, `my folder`, `Abc`, `ab`, `a--b`, `-ab`, 63/64 chars; navigates into the new folder; upload lands there; Enter submits; double submit creates one folder; Cancel discards; Esc closes only the form | AC4–AC8 regression | PASS | one POST 204; 5 invalid names rejected inline with no request; navigates in, search cleared; upload lands; Enter; double-click → 1 folder; Cancel/Esc discard |
| S1′ | Security: a `{{=(globalThis.__x5443='ran','x')}}` segment and a `{{draft}}` segment in a folder path stay literal when a subfolder is created inside them; nothing executes | review comment 111005 | PASS | literal parentUrl + breadcrumb for both segments, subfolders in the right place (window read hook-blocked) — r2b-s1-evil-subfolder-breadcrumb.png |
| R1′ | Single-select picker basics: open, browse, search, upload, select | 060b CMS-139..143 | PASS | open/browse/search/upload/select/Save |
| U2′ | Keyboard: Tab reaches New folder, input, Cancel, Create; focus goes to the input when the form opens | BL-UI-007 | PASS | focus to input; Tab input → Cancel → Create; visible focus rings — r2b-u2-*.png |
| X′ | Console: no new errors. Network: no 4xx/5xx other than the expected validation responses | always-on | PASS | no new console errors / unexpected 4xx-5xx; Text block editor renders (qa1 chunk 404 was the rollover) — r2b-x-text-block-editor.png |

**Round 2 status: INVALID RUN, not graded (2026-10-23 08:10Z).** Timeline: the PR #166 pin went live at 07:45Z, the agent started at 07:49Z, and at 07:52:42Z vc-deploy-dev#6978 (VCST-6327) re-pinned PageBuilderModule to `3.1036.0-pr-174-1cae`, live at 07:55Z. PR #174 does not contain #166 (compare: 25 ahead, 5 behind). For the rest of the session the browser got the #166 `main-HAAVLKFY.js` from the Cloudflare cache (`cf-cache-status: HIT`), while the backend and any uncached chunks came from the #174 container. Two effects of that mix: `chunk-GJCLQQ4H.js` returned 404, and the Text block had no editor. Those two are **rollover artifacts, not bugs**: the chunk is present in the #166 artifact zip. Observed on the mixed build and to be re-confirmed on a clean pin: R2a′/R2b′/R2c′ PASS, U1′ PASS at 1920 px but FAIL below ~650 px (`r2-u1-error-Abc-390.png`: the error collapses to ~21 px and breaks per character, the grid drops 553–658 px), A1′ no multi-select control (also confirmed in the theme source), B/S1/R1/U2 PASS. Test data was cleaned up, including round-1 leftover roles and users.

**Round 2b — clean re-run on vcst-qa, VALID (2026-10-23 08:32–08:45Z).** PageBuilderModule `3.1036.0-pr-166-e2d3` pinned via vc-deploy-dev#6979; the build guard (module version + `main-HAAVLKFY.js` + `.folder-form-message`) passed at both start and end, and the bundle watcher saw no change. The verdicts in the table above are from this run.

**Round 2 verdict: FAIL.** AC1/AC2 are still not met: no Designer control opens the picker in multi-select mode (theme schemas are `multiple: false` on vc-frontend `dev` and `master`). BUG-2 is **fixed**. BUG-1 is **fixed at ≥ 768 px only**; below ~700 px the error still shifts the grid, and at 390 px the shift is worse than round 1 (up to 658 px). That is graded Low, the same class as BUG-1, so it is not filed. Also not filed (Low or observation): visible label "Cancel new folder" (round-1 suggestion, unchanged); asset counter "6 assets" counts files only and says "1 assets" for one. Cleanup: page, folders, 2 users and 2 roles deleted and re-listed empty. **Temporary pin on vcst-qa (#6979) must be reverted after QA.**

---

## Round 3 — 2026-10-26 · PR #166 head `3a31b201` (new: `b5ea2da2`, `3a31b201`)

**Build:** PageBuilderModule `3.1036.0-pr-166-3a31` on vcst-qa via vc-deploy-dev#6989 (live 08:10Z, served `main-HTHV37WC.js`, matching the artifact). The first pin #6988 was overwritten 3 min after merge by a direct push pinning PR #177 (VCST-6381), so the stand is contended: a build guard runs at start and end, plus a bundle watcher.
**What changed:**
- `b5ea2da2` (Designer):
  - Upload accepts several files even for a single-asset control, and the last uploaded file is selected.
  - The New folder form now has confirm/cancel icon buttons in the input row. Their accessible names are "Create folder" and "Cancel new folder".
  - The error sits below the row in a reserved two-line slot.
- `3a31b201` (**Admin Asset Library workspace**, Vue shell): "Sort by" is now the select's prefix instead of a label above it.

| # | Condition | Source | Verdict | Evidence |
|---|---|---|---|---|
| N1 | Single Image control: Upload several files in one pass → all upload into the current folder (one request each, 200), the last uploaded file is selected, Select applies one scalar; large/oversized file → inline error, others still upload | `b5ea2da2` · round-1 suggestion | PASS (agent + operator) | 3 files in one chooser pass → 3× POST 200; 2-file drop → 2× 200; last uploaded is selected; Save stores a scalar. Oversized: NOT AVAILABLE (no maxFileSize configured) — r3-n1-*.png |
| N2 | Folder form icon buttons: confirm/cancel are square, aligned with the input (BL-UI-005), have accessible names, are Tab-reachable with a visible focus ring, and confirm is disabled on an invalid/empty name; Enter submits, Esc/cancel discard; only one "Cancel" now visible in the dialog | `b5ea2da2` · BL-UI-007 | PASS | input and both icon buttons 42 px, same top; names "Create folder" / "Cancel new folder"; Tab input → Create → Cancel; focus rings; Create disabled when the name is invalid; one "Cancel" in the dialog — r3-n2-*.png |
| N3 | Error layout at 1920/1280/1024/768/640/560/390: grid shift 0 when the error appears; message inside its slot (no per-character wrap, no clipping, no overlap) | BUG-1 retest · BL-UI-003/004 | PASS ≥ 430 px · FAIL at 390 (Low) | shift 0 at 1920 … 430; at 390 the message takes 3 lines and the slot holds 2, so +17 px (round 2: +658) — r3-n3-error-Abc-390.png |
| N4 | Admin Asset Library workspace (Admin → Page Builder → Assets tab): "Sort by" prefix sits inside the select, the select is level with the other toolbar controls at 1920/1280/768; every sort option re-orders the list | `3a31b201` · BL-UI-005 | PASS layout + sort · FAIL a11y (Low) | prefix inside the select, centres within 1 px at 1920/1280, wraps aligned at 768; all 4 sorts correct. **The sort combobox has no accessible name** (label → prefix) — r3-n4-*.png |
| R2′ | Permissions: without `platform:asset:create` neither Upload nor New folder (incl. multi-file drop); with it both work | BUG-2 regression | PASS | no permission: no Upload/New folder, 2-file drop → no request; with permission: folder 204, 2× upload 200 — r3-r2-*.png |
| A1″ | Multi-select still unreachable from any Designer control? (quick re-check of Image / CTA with Image / Features / Slider) | AC1, AC2 | NOT AVAILABLE | deployed theme (pr-2570) has multiple:false in all 4 controls; the multi control (Image carousel) is only in vc-frontend PR #2595, not deployed |
| B″ | New folder regression: one POST 204, validation (`Abc`, `ab`, `a--b`, 64 chars rejected; 63 chars, `my folder` accepted), navigates into the folder, search cleared, upload lands there, double submit → one folder | AC4–AC8 | PASS | 4 invalid names rejected with no request; 63 chars + double-click → one POST 204; navigates in, search cleared, upload lands |
| S1″ | `{{=…}}` / `{{draft}}` folder segments stay literal | review comment 111005 | PASS | literal parentUrl + breadcrumb for both segments; subfolders in the right place |
| X″ | Console: no new errors. Network: no unexpected 4xx/5xx | always-on | PASS | 0 console errors in the admin Designer session; no unexpected 4xx/5xx on asset traffic |

**N1 — operator manual check (2026-10-26):** in the Designer picker, Upload → selected several files in the file chooser → all were uploaded. **PASS (manual).** This is multi-file *upload*. It does not cover AC1/AC2, which is applying several selected assets to one control.

**Round 3 run (valid):** the build guard passed at 7 points from 08:19 to 08:36Z, and the bundle watcher saw no change. New in this round, both Low and not filed:
- (a) the Asset Library sort select lost its accessible name when 3a31b201 moved the label to a prefix (BL-UI-007);
- (b) at 390 px the error needs 3 lines, the slot reserves 2, and the grid moves +17 px (BL-UI-003).

Not observable here: a mixed batch with an oversized file would upload nothing (the handler returns before uploading the valid files). Read from the source and not verified live, because no `maxFileSize` is configured.

**Still open: AC1/AC2.** The multi-select control is **Image carousel** (`images`, `multiple: true`) in vc-frontend PR #2595 (VCST-5443, open). vcst-qa runs theme pr-2570, so the control has not been tested anywhere.

---

## Round 4 — 2026-10-26 · AC1/AC2 on the Image carousel control (theme PR #2595 + module PR #166)

**Build:** vcst-qa, PageBuilderModule `3.1036.0-pr-166-3a31` (Designer `main-HTHV37WC.js`) + theme `vc-theme-b2b-vue-2.61.0-pr-2595-5fb3`. The theme was pinned by vc-deploy-dev#6991 and has been served (`mf-entry-bootstrap-0-db34db41.js`) since 08:54:57Z. The theme PR adds the **Image carousel** section, whose `images` control declares `multiple: true`. Its author notes it was not checked in a browser against the Designer.

| # | Condition | Source | Verdict | Evidence |
|---|---|---|---|---|
| M0 | Image carousel is listed among the Designer's addable sections and can be added | precondition | PASS | Image carousel listed and added (Title, Subtitle, Images, Slide height) — r4-m0-*.png |
| M1 | Its Images control opens the picker in **multi-select** mode (checkboxes or multi-highlight, Select shows a count); picking 3 assets → Select applies all 3 to the control | AC1, AC2 | PASS | checkbox badges, Select (N) from 2 picks; 3 picked → control shows 3, preview becomes a carousel — r4-m1-*.png (operator saw the same) |
| M2 | Selection across folders: pick in folder X, open folder Y, pick more → the set is kept, Select (N) applies all | AC1 | PASS | 2 in x + 2 in y → Select (4) → 4 applied in click order — r4-m2-cross-folder-select-4.png |
| M3 | Pending multi-selection survives New folder → create → the picker enters the new folder, the count is unchanged, Select applies them all | AC8 | PASS | 2 pending → New folder (204) → dialog open, inside the new folder, Select (2) applies 2; double-click Select applies once — r4-m3-*.png |
| M4 | Save → reload the Designer → all N images are still in the control **in the selected order**; the stored page JSON holds an array; re-opening the picker shows the current set | AC2 | PASS | Save 200 → reload → same 4 in order; stored `images` = array of 4 URL strings in click order; re-open shows nothing pre-selected — r4-m4-*.png |
| M5 | Deselect and cancel: unchecking removes one from the set; Cancel/✕/Esc leaves the control unchanged; re-opening and adding more appends or replaces (report which) | AC1 | PASS · **finding F1** | uncheck works; Cancel/✕/Esc leave the control unchanged; **re-open + Select APPENDS with no dedup** → a later save held 10 items, 3 duplicates (purple, red, blue) = duplicate slides |
| M6 | Designer preview and the published storefront render the carousel with the N images as slides (as many slides as images, correct order, no broken images) | AC2 · theme PR | PASS | Designer preview and the published storefront show 4 slides in order, images 200, arrows work; Slide height Small ~450 / Large 550 — r4-m6-*.png |
| M7 | Single-value controls are unchanged with this theme: Image, Slider slide, Features column, CTA with Image still single (second click replaces) | AC3 | PASS | Image, CTA with Image, Features column, Slider slide stay single; Image saves a scalar |
| M8 | Multi-file Upload inside a multi control: the uploaded files join the selection (or report the behaviour) | `b5ea2da2` × multi | REPORTED | files uploaded inside a multi picker JOIN the pending selection (Select (4)) and are appended in upload order |
| X‴ | Console: no new errors in the Designer or on the storefront page. Network: no unexpected 4xx/5xx | always-on | PASS | 0 console errors in Designer and storefront; no 4xx/5xx |

**Round 4 — operator manual review (2026-10-26), Image carousel picker in multi mode, for the developer (vc-module-pagebuilder picker):**
1. **The checkmark is off-centre in the tile checkbox.** In a checked tile the ✓ glyph sits off-centre inside the blue square, so it needs centring horizontally and vertically (BL-UI-005).
2. **Remove the selection count from the Select button.** "Select (3)" / "Select (5)" wraps onto two lines inside the button (BL-UI-004/005), and the footer buttons then differ in height and layout.
3. **Proposal: show the count in the footer instead**, at the left, on the same row as Items per page / pagination (for example "3 selected"), so Select keeps a one-line label.

**Round 4 run (valid, 08:58–09:09Z):** the build guard passed at 5 points for module, Designer and theme, and the storefront footer shows `Ver. 2.61.0-pr-2595-5fb3`. **AC1, AC2, AC3 and AC8 are met on Image carousel.** AC1/AC2 therefore depend on **vc-frontend PR #2595** shipping together with module PR #166.

Findings:
- **F1, Medium, module PR #166.** Re-opening the picker on a filled multi control shows no current selection, and Select appends without dedup, so the same asset is stored and rendered twice. This arguably contradicts "applied as a set" (AC2). Needs a PO/dev decision: pre-select and replace, or append with dedup.
- **F2, Low–Medium, BL-UI-007, module.** In multi mode the selected state of a tile is not exposed to assistive tech: no pressed/checked/selected state, and the badge is aria-hidden. Keyboard Space/Enter toggling works.
- **F3, Low, module.** The "Select (N)" label wraps to 2 lines. The operator also found that the ✓ is off-centre, and proposed moving the count to the left of the footer.
- **Observation, pre-existing slider.vue (inherited by the carousel):** the arrows are divs with no name and are not keyboard-reachable, and every slide has `alt="Slider image"`.
- Cleanup: the page (deleted; unpublish refused because it had unsaved changes), both folders, 8 files and the subfolder were deleted and re-listed empty.

**Operator decisions (2026-10-26):**
- F1 is **BY DESIGN**: re-opening appends to the set.
- F2 is **deferred**: not fixing for now.
- F3 (centre the checkmark; drop the count from Select; show the count in the footer) was posted to the ticket as comment 112358 with 4 inline screenshots.
- **No status transition**: the ticket stays in Testing.

---

## Round 5 — 2026-10-26 · F3 retest on PR #166 head `4108ac1e`

**Build:** vcst-qa, PageBuilderModule `3.1036.0-pr-166-4108` (pinned by vc-deploy-dev#6993; Designer `main-OSEYE5IV.js` served since 09:44Z) + theme `pr-2595-5fb3`. The agent could not run because the vcst `admin` was locked out from about 09:33Z (not by this run). **The operator checked it by hand.**

| # | Condition | Verdict | Evidence |
|---|---|---|---|
| F3.1 | Selection marker: ✓ centred | **PASS (manual)** | round marker with a white ring and a centred white ✓; unselected tiles show an empty circle — r5-operator-f3-fixed-4108.png |
| F3.2 | Select button has no count | **PASS (manual)** | plain one-line "Select", same height as Cancel |
| F3.3 | Count in the footer, left of the pager | **PASS (manual)** | "3 selected" at the left of the pager row |

Nit (Low, optional): the paginator keeps its own white background while the rest of the pager row ("3 selected") is grey, so the row reads as two blocks.

**Round 5 — agent run (operator asked for it, 2026-10-26).** Login works again (10:43Z), and the server reports PageBuilderModule `3.1036.0-pr-166-4108`.

| # | Condition | Source | Verdict | Evidence |
|---|---|---|---|---|
| P1 | Marker geometry: ✓ glyph centre equals the marker centre within 1 px; marker round with white ring; ✓ white and not clipped; unselected = empty circle | F3.1 · BL-UI-005 | PASS | 24×24 circle, white ring (1.6 px computed), white ✓ centred (element delta 0/0, ink delta 0.3/0.95 px); unselected = empty circle — r5-p1-markers-1-selected.png |
| P2 | Select label always "Select" (0/1/3/5 picked), one line, same height as Cancel; disabled at 0 | F3.2 · BL-UI-004/005 | PASS | exactly "Select" at 0/1/2/3/5, 104×46 same as Cancel, never wraps |
| P3 | "N selected" at the left of the pager in multi mode: correct for 1/3/5, empty at 0, updates on uncheck, `aria-live` announces it; **absent** in single-mode controls | F3.3 · BL-UI-007 | PASS | "1/3/5 selected", "2 selected" after uncheck, empty 0×0 at 0, aria-live=polite; single Image never shows it — r5-p6-image-single-no-count.png |
| P4 | Pager row at 1920/768/390: count and paginator vertically centred, no overlap or clipping, the row height does not change when the count appears (no grid shift); background consistency noted | BL-UI-003/004/005 | PASS 1920/768 · **FAIL 390 (Low)** | 1920/768: centres equal, no overlap, grid top unchanged 0→5 picks. 390: with a count the paginator is squeezed, "1 – 3 of 3" breaks per character, the row grows 90→142 px and overflows ~15 px — r5-p4-pager-390-1-selected-wrap.png. Paginator white vs row grey confirmed (the nit) |
| P5 | Multi regression on Image carousel: pick across 2 folders → Select applies all in order → Save → reload keeps them | AC1/AC2 | PASS | x1, x3, y2, y1 → Select (double-click applies once) → Save array of 4 in order → reload keeps 4 in order — r5-p5-after-reload-4-in-order.png |
| P6 | Single regression: Image control second click replaces, scalar saved, no count shown | AC3 | PASS | second click replaces; Save stores a scalar; no count |
| P7 | New folder mid-selection keeps the count and selection; one POST 204 | AC8 | PASS | 2 pending → New folder 204 → dialog open, "2 selected", Select applies 2 — r5-p7-new-folder-2-selected.png |
| X⁗ | Console: no new errors. Network: no unexpected 4xx/5xx | always-on | PASS | 0 console errors; no unexpected 4xx/5xx |

**Round 5 agent run (valid, 10:44–10:54Z):** module, Designer and theme matched at every guard point. **F3 is fixed (all three items, measured).** New finding:
- **BUG-R5-1, Low, introduced by 4108ac1e.** At 390 px the count squeezes the paginator: the range label breaks per character, the pager row grows 52 px and overflows. It is fine at 540 px and wider.

Nit, confirmed: the paginator's white background against the grey row. Cleanup: the page, 2 folders, the subfolder and 6 files were deleted and re-listed empty.

**Operator decision (2026-10-26):** the Page Builder Designer has no mobile layout, so narrow-viewport findings are **out of scope**: BUG-R5-1 (390 px pager squeeze), BUG-R3-2 (390 px +17 px folder-error shift) and the round-2 below-~700 px layout rows.

**Final verdict: PASS WITH NOTES (2026-10-26).** All 8 ACs are met at desktop widths: AC1/AC2 on the Image carousel control (vc-frontend PR #2595), the rest on vc-module-pagebuilder PR #166 @ `4108ac1e`. BUG-2, BUG-1 and F3 are fixed. Notes:
- the developer fixes the paginator background and releases directly;
- the Assets Library sort select has no accessible name (Low);
- **PR #2595 must ship together with PR #166**, because without it no Designer control reaches multi-select.

Ticket moved Testing → **Tested** ("Finish test") on operator confirmation.
